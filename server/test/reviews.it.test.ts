import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import { PrListItem } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns } from './helpers/runs.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockEmbedder, MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import { eq } from 'drizzle-orm';
import type { Review, StructuredRequest } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

/**
 * A unified diff touching src/config.ts (line 11 added) so grounding can keep a
 * finding on line 11 and drop one on line 999 / a non-existent file.
 */
const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  stripeKey: "sk_live_xxx",
   redisUrl: x,`;

/** A Review fixture: one valid finding (line 11), one hallucinated (line 999). */
const REVIEW_FIXTURE: Review = {
  verdict: 'request_changes',
  summary: 'Hardcoded Stripe secret introduced.',
  score: 42,
  findings: [
    {
      id: 'f-valid',
      severity: 'CRITICAL',
      category: 'security',
      title: 'Hardcoded Stripe secret key',
      file: 'src/config.ts',
      start_line: 11,
      end_line: 11,
      rationale: 'A live Stripe key is committed in source.',
      suggestion: 'Move the key to an environment variable.',
      confidence: 0.95,
      kind: 'finding',
    },
    {
      id: 'f-halluc',
      severity: 'WARNING',
      category: 'bug',
      title: 'Phantom finding on a line not in the diff',
      file: 'src/config.ts',
      start_line: 999,
      end_line: 999,
      rationale: 'This line does not exist in the diff.',
      confidence: 0.5,
      kind: 'finding',
    },
  ],
};

let repoSeq = 0;
async function setupRepoAndPr(db: PgFixture['handle']['db'], workspaceId: string) {
  const name = `payments-api-${repoSeq++}`;
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
    .returning();
  const [pr] = await db
    .insert(t.pullRequests)
    .values({
      workspaceId,
      repoId: repo!.id,
      number: 482,
      title: 'Add rate limiting',
      author: 'marisa.koch',
      branch: 'feat/rl',
      base: 'main',
      headSha: 'a1b2c3d4',
      additions: 1,
      deletions: 0,
      filesCount: 1,
      status: 'needs_review',
      body: 'Add rate limiting. Closes #471.',
    })
    .returning();
  // persist the patch so the reviewer can reconstruct a diff (MockGit also returns one)
  await db.insert(t.prFiles).values({
    prId: pr!.id,
    path: 'src/config.ts',
    additions: 1,
    deletions: 0,
    patch: '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,',
  });
  return { repo: repo!, pr: pr! };
}

d('A2 reviews + agents (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function appWith(structured: unknown, provider: 'openai' | 'anthropic' = 'openai') {
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: DIFF }),
        llm: {
          [provider]: new MockLLMProvider(provider, { structured }),
        },
      },
    });
  }

  it('lists the latest started run per scoped PR, including reruns and missing traces', async () => {
    const queries: string[] = [];
    const db = drizzle(pg.handle.sql, {
      schema: t.schema,
      logger: { logQuery: (query) => queries.push(query) },
    });
    const llm = new MockLLMProvider('openai');
    const app = await buildApp({ config: config(), db, overrides: {
      github: new MockGitHubClient({ pulls: [] }), llm: { openai: llm },
    } });
    try {
      await app.ready();
      const { repo, pr } = await setupRepoAndPr(db, workspaceId);
      const sibling = await setupRepoAndPr(db, workspaceId);
      const [foreignWs] = await db.insert(t.workspaces).values({ name: 'Other' }).returning();
      const foreign = await setupRepoAndPr(db, foreignWs!.id);
      const list = async () => {
        queries.length = 0;
        const res = await app.inject({ method: 'GET', url: `/repos/${repo.id}/pulls` });
        expect(res.statusCode).toBe(200);
        expect(queries.filter((q) => q.includes('"agent_runs"'))).toHaveLength(1);
        return PrListItem.array().parse(res.json());
      };
      expect((await list()).map((item) => item.latest_run)).toEqual([null]);
      const { id: _id, ...base } = pr;
      await db.insert(t.pullRequests).values(Array.from({ length: 19 }, (_, i) => ({
        ...base, number: pr.number + 1 + i,
      })));
      const common = { workspaceId, prId: pr.id, status: 'done', ranAt: new Date('2026-01-02') };
      const [agentA, agentB] = await db.insert(t.agents).values(['A', 'B'].map(name => ({
        workspaceId, name, provider: 'openai' as const, model: 'test', systemPrompt: 'Review',
      }))).returning();
      const [older] = await db.insert(t.agentRuns).values({
        ...common, status: 'running', ranAt: new Date('2026-01-01'), agentId: agentA!.id,
      }).returning();
      // Manual rerun and a sibling agent start at the same instant. Insert the winner first.
      const winner = '00000000-0000-4000-8000-000000000002';
      const tied = '00000000-0000-4000-8000-000000000001';
      const foreignRun = '00000000-0000-4000-8000-000000000003';
      await db.insert(t.agentRuns).values([
        { ...common, id: winner, status: 'running', agentId: agentA!.id },
        { ...common, id: tied, agentId: agentB!.id },
        { ...common, prId: sibling.pr.id, ranAt: new Date('2026-01-03') },
        { ...common, workspaceId: foreignWs!.id, prId: foreign.pr.id },
        // Separate FKs allow a malformed import to reference a PR in another workspace.
        { ...common, id: foreignRun, workspaceId: foreignWs!.id, ranAt: new Date('2026-01-04') },
      ]);
      const usage = (attempt_id: string, cost_usd: number | null) => ({ usage: { attempt_id, cost_usd } });
      await db.insert(t.runTraces).values([older!.id, tied, foreignRun].map(runId => ({
        runId, trace: { log: [usage('1', 9)] },
      })));
      const selected = async () => {
        const items = await list();
        expect(items).toHaveLength(20);
        expect(items.filter(item => item.latest_run === null)).toHaveLength(19);
        return items.find(item => item.id === pr.id)!.latest_run;
      };
      expect(await selected()).toEqual({ status: 'running', cost_usd: null });
      await db.update(t.agentRuns).set({ status: 'failed' }).where(eq(t.agentRuns.id, winner));
      expect(await selected()).toEqual({ status: 'failed', cost_usd: null });
      const writeLog = (log: unknown[]) => db.insert(t.runTraces).values({ runId: winner, trace: { log } })
        .onConflictDoUpdate({ target: t.runTraces.runId, set: { trace: { log } } });
      const repair = usage('2', 0.00612);
      await writeLog([usage('1', 0.00412), repair, usage('3', 0.004), repair, { cost_usd: 0.01424 }]);
      await db.update(t.agentRuns).set({ status: 'done' }).where(eq(t.agentRuns.id, older!.id));
      expect(await selected()).toEqual({ status: 'failed', cost_usd: 0.01424 });
      const traceCost = async (id: string) => (await app.inject({ url: `/runs/${id}/trace` })).json().stats.cost_usd;
      expect(await traceCost(older!.id)).toBe(9);
      expect(await traceCost(winner)).toBe(0.01424);
      await db.update(t.agentRuns).set({ status: 'running' }).where(eq(t.agentRuns.id, winner));
      expect(await selected()).toEqual({ status: 'running', cost_usd: null });
      await db.update(t.agentRuns).set({ status: 'done' }).where(eq(t.agentRuns.id, winner));
      await writeLog([usage('1', 0)]);
      expect(await selected()).toEqual({ status: 'done', cost_usd: 0 });
      expect(await traceCost(winner)).toBe(0);
      for (const log of [[usage('1', 1), usage('2', null)], [{ msg: 'legacy' }]]) {
        await writeLog(log);
        expect(await selected()).toEqual({ status: 'done', cost_usd: null });
        expect(await traceCost(winner)).toBeNull();
      }
      expect((await app.inject({ url: `/repos/${foreign.repo.id}/pulls` })).statusCode).toBe(404);
      expect(llm.calls).toHaveLength(0);
    } finally {
      await app.close();
    }
  });

  it.each(['failed', 'cancelled'] as const)('retains priced attempts in the saved %s trace', async (status) => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const fixture = status === 'failed' ? {} : REVIEW_FIXTURE;
    class PausedProvider extends MockLLMProvider {
      override async completeStructured<T>(req: StructuredRequest<T>) {
        started();
        await gate;
        return super.completeStructured(req);
      }
    }
    const started = vi.fn();
    const llm = new PausedProvider('openai', { structured: fixture });
    const app = await buildApp({ config: config(), db: pg.handle.db, overrides: {
      github: new MockGitHubClient({ pulls: [] }), llm: { openai: llm },
      git: new MockGitClient({ diff: DIFF + '\n' + DIFF.replaceAll('config.ts', 'second.ts') }),
    } });
    try {
      const { repo, pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
      const agent = (await app.inject({ method: 'POST', url: '/agents', payload: {
        name: 'Map', provider: 'openai', model: 'test', system_prompt: 'Review', strategy: 'map-reduce',
      } })).json();
      const trigger = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`,
        payload: { agentId: agent.id } });
      const runId = trigger.json().runs[0].run_id;
      await vi.waitFor(() => expect(started).toHaveBeenCalledTimes(1));
      if (status === 'cancelled') await app.inject({ method: 'POST', url: `/runs/${runId}/cancel` });
      release();
      await vi.waitFor(async () => {
        const res = await app.inject({ url: `/repos/${repo.id}/pulls` });
        expect(res.json()[0].latest_run).toEqual({ status, cost_usd: 0.001 });
      });
      const trace = (await app.inject({ url: `/runs/${runId}/trace` })).json();
      expect(trace.log.filter((line: { usage?: unknown }) => line.usage)).toEqual([
        expect.objectContaining({ usage: { attempt_id: '1', cost_usd: 0.001 } }),
      ]);
    } finally {
      release();
      await app.close();
    }
  });

  it('agents CRUD', async () => {
    const app = await appWith(REVIEW_FIXTURE);

    const created = await app.inject({
      method: 'POST',
      url: '/agents',
      payload: {
        name: 'Test Reviewer',
        provider: 'openai',
        model: 'gpt-4.1',
        system_prompt: 'You are a reviewer.',
      },
    });
    expect(created.statusCode).toBe(201);
    const agent = created.json();
    expect(agent.version).toBe(1);

    const list = (await app.inject({ method: 'GET', url: '/agents' })).json();
    expect(list.some((a: { id: string }) => a.id === agent.id)).toBe(true);

    // a config change bumps version
    const updated = (
      await app.inject({
        method: 'PUT',
        url: `/agents/${agent.id}`,
        payload: { system_prompt: 'Updated prompt.' },
      })
    ).json();
    expect(updated.version).toBe(2);

    await app.close();
  });

  it('runs a review: map-reduce + grounding drops the hallucinated finding, keeps the valid one', async () => {
    const app = await appWith(REVIEW_FIXTURE);
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Sec', provider: 'openai', model: 'gpt-4.1', system_prompt: 'sec' },
      })
    ).json();

    const res = await app.inject({
      method: 'POST',
      url: `/pulls/${pr.id}/review`,
      payload: { agentId: agent.id },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.runs).toHaveLength(1);

    // runReview is fire-and-forget: wait for the background run, then read the
    // persisted reviews (the POST returns runIds, not the reviews themselves).
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });
    const reviews = (
      await app.inject({ method: 'GET', url: `/pulls/${pr.id}/reviews` })
    ).json();
    expect(reviews).toHaveLength(1);

    const review = reviews[0];
    expect(review.verdict).toBe('request_changes');
    // Score is derived from the GROUNDED findings, not the model's self-reported
    // 42: grounding keeps one CRITICAL (line 11) ⇒ 100 − 35 = 65.
    expect(review.score).toBe(65);
    // grounding kept only the valid finding (line 11), dropped the line-999 one
    expect(review.findings).toHaveLength(1);
    expect(review.findings[0].file).toBe('src/config.ts');
    expect(review.findings[0].start_line).toBe(11);

    // a run_traces document was written (single doc)
    const runId = body.runs[0].run_id;
    const trace = (await app.inject({ method: 'GET', url: `/runs/${runId}/trace` })).json();
    expect(trace.config.model).toBe('gpt-4.1');
    expect(trace.stats.grounding).toBe('1/2 passed');
    expect(trace.log).toContainEqual(expect.objectContaining({ usage: { attempt_id: '1', cost_usd: 0.001 } }));

    // agent_runs row populated for A5 to aggregate
    const [run] = await pg.handle.db.select().from(t.agentRuns).where(eq(t.agentRuns.id, runId));
    expect(run!.status).toBe('done');
    expect(run!.findingsCount).toBe(1);
    expect(run!.grounding).toBe('1/2 passed');

    await app.close();
  });

  it('dual-provider structured output: anthropic provider returns the same Review shape', async () => {
    const app = await appWith(REVIEW_FIXTURE, 'anthropic');
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Claude Rev', provider: 'anthropic', model: 'claude-x', system_prompt: 'rev' },
      })
    ).json();
    await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: agent.id } });
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });
    const reviews = (
      await app.inject({ method: 'GET', url: `/pulls/${pr.id}/reviews` })
    ).json();
    expect(reviews[0].findings).toHaveLength(1);
    expect(reviews[0].model).toBe('claude-x');
    await app.close();
  });

  it('finding actions: accept, dismiss', async () => {
    const app = await appWith(REVIEW_FIXTURE);
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'ActAgent', provider: 'openai', model: 'gpt-4.1', system_prompt: 's' },
      })
    ).json();
    await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: agent.id } });
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });
    const reviews = (
      await app.inject({ method: 'GET', url: `/pulls/${pr.id}/reviews` })
    ).json();
    const findingId = reviews[0].findings[0].id;

    const accepted = (
      await app.inject({ method: 'POST', url: `/findings/${findingId}/accept` })
    ).json();
    expect(accepted.finding.accepted_at).not.toBeNull();

    const dismissed = (
      await app.inject({ method: 'POST', url: `/findings/${findingId}/dismiss` })
    ).json();
    expect(dismissed.finding.dismissed_at).not.toBeNull();
    expect(dismissed.finding.accepted_at).toBeNull();

    await app.close();
  });

  it('SSE: /runs/:id/events streams events and completes', async () => {
    const app = await appWith(REVIEW_FIXTURE);
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'SseAgent', provider: 'openai', model: 'gpt-4.1', system_prompt: 's' },
      })
    ).json();
    // The run is synchronous; events are buffered on the bus. Subscribing after
    // the run still replays the buffer (replay-first semantics), then completes.
    const body = (
      await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: agent.id } })
    ).json();
    const runId = body.runs[0].run_id;

    const sse = await app.inject({ method: 'GET', url: `/runs/${runId}/events` });
    expect(sse.statusCode).toBe(200);
    expect(sse.headers['content-type']).toContain('text/event-stream');
    // The replay buffer should contain our log lines as SSE `data:` frames.
    expect(sse.payload).toContain('Starting review');
    expect(sse.payload).toContain('Citation grounding');
    await app.close();
  });

  it('run all enabled agents reviews with each enabled agent', async () => {
    const app = await appWith(REVIEW_FIXTURE);
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const body = (
      await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { all: true } })
    ).json();
    // seed has 2 enabled agents; we may have created more above in this PR's ws.
    expect(body.runs.length).toBeGreaterThanOrEqual(2);
    await app.close();
  });
});
