import PQueue from 'p-queue';
import { and, eq } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import * as t from '../db/schema.js';
import { withTimeout, withRetry } from './resilience.js';

/**
 * JobRunner — async work (clone, PR import, indexing, polling) on a
 * concurrency-limited p-queue, mirrored into the `jobs` table with
 * timeouts + retry/backoff.
 *
 * Handlers are registered by kind. enqueue() inserts a `jobs` row, schedules
 * the handler on the queue, and updates status/attempts/error as it runs.
 */

export type JobHandler = (payload: unknown, ctx: { jobId: string }) => Promise<void>;

export interface JobRunnerOptions {
  concurrency?: number;
  timeoutMs?: number;
  retries?: number;
}

export interface EnqueuedJob {
  id: string;
  /** Resolves when the job finishes (or rejects if it ultimately fails). */
  done: Promise<void>;
}

export class JobRunner {
  private queue: PQueue;
  private handlers = new Map<string, { handler: JobHandler; timeoutMs: number }>();
  private timeoutMs: number;
  private retries: number;

  constructor(
    private db: Db,
    opts: JobRunnerOptions = {},
  ) {
    this.queue = new PQueue({ concurrency: opts.concurrency ?? 3 });
    this.timeoutMs = opts.timeoutMs ?? 120_000;
    this.retries = opts.retries ?? 2;
  }

  register(kind: string, handler: JobHandler, opts: { timeoutMs?: number } = {}): void {
    this.handlers.set(kind, { handler, timeoutMs: opts.timeoutMs ?? this.timeoutMs });
  }

  async enqueue(workspaceId: string, kind: string, payload: unknown): Promise<EnqueuedJob> {
    if (!this.handlers.has(kind)) throw new Error(`No job handler registered for kind '${kind}'`);

    const [row] = await this.db
      .insert(t.jobs)
      .values({ workspaceId, kind, payload: payload as object, status: 'queued' })
      .returning({ id: t.jobs.id });
    return this.schedule(row!.id, kind, payload);
  }

  /** Run a queued job inserted as part of a feature transaction. */
  schedule(jobId: string, kind: string, payload: unknown): EnqueuedJob {
    const registration = this.handlers.get(kind);
    if (!registration) throw new Error(`No job handler registered for kind '${kind}'`);
    const { handler, timeoutMs } = registration;
    const done = this.queue.add(async () => {
      const [started] = await this.db
        .update(t.jobs)
        .set({ status: 'running', startedAt: new Date() })
        .where(and(eq(t.jobs.id, jobId), eq(t.jobs.status, 'queued')))
        .returning({ id: t.jobs.id });
      if (!started) return;
      try {
        await withRetry(
          () =>
            withTimeout(handler(payload, { jobId }), timeoutMs).then(async () => {
              await this.db
                .update(t.jobs)
                .set({ attempts: 1 })
                .where(eq(t.jobs.id, jobId));
            }),
          {
            retries: this.retries,
            onRetry: async (attempt) => {
              await this.db
                .update(t.jobs)
                .set({ attempts: attempt })
                .where(eq(t.jobs.id, jobId));
            },
          },
        );
        await this.db
          .update(t.jobs)
          .set({ status: 'done', finishedAt: new Date() })
          .where(eq(t.jobs.id, jobId));
      } catch (err) {
        await this.db
          .update(t.jobs)
          .set({
            status: 'failed',
            finishedAt: new Date(),
            error: (err as Error).message,
          })
          .where(eq(t.jobs.id, jobId));
        throw err;
      }
    }) as Promise<void>;

    return { id: jobId, done };
  }

  /** Wait for the queue to drain (useful in tests). */
  async onIdle(): Promise<void> {
    await this.queue.onIdle();
  }
}
