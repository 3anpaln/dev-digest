import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import { FindingPreview, PrListItem } from '@devdigest/shared';
import { ReviewRepository } from '../src/modules/reviews/repository.js';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns } from './helpers/runs.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockEmbedder, MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import { eq, inArray } from 'drizzle-orm';
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

  it('counts findings from each agent’s latest attempt and limits the preview per PR', async () => {
    const db = pg.handle.db;
    const app = await buildApp({ config: config(), db, overrides: {
      github: new MockGitHubClient({ pulls: [] }),
    } });
    try {
      await app.ready();
      const { repo, pr } = await setupRepoAndPr(db, workspaceId);
      const { id: _id, ...base } = pr;
      const [second, empty, unlinked] = await db.insert(t.pullRequests).values([
        { ...base, number: pr.number + 1 },
        { ...base, number: pr.number + 2 },
        { ...base, number: pr.number + 3 },
      ]).returning();
      const [foreign] = await db.insert(t.workspaces).values({ name: 'Foreign review workspace' }).returning();
      const [agentA, agentB, agentC] = await db.select({ id: t.agents.id }).from(t.agents)
        .where(eq(t.agents.workspaceId, workspaceId));
      const run = { workspaceId, prId: pr.id, status: 'done', ranAt: new Date('2026-01-01') };
      const rerun = { ...run, ranAt: new Date('2026-01-02') };
      const [
        previousA, latestA, latestB, previousC, , secondRun, previousSecond, , emptyRun, previousEmpty,
      ] = await db.insert(t.agentRuns).values([
        { ...run, agentId: agentA!.id },
        { ...rerun, agentId: agentA!.id },
        { ...run, agentId: agentB!.id },
        { ...run, agentId: agentC!.id },
        { ...rerun, agentId: agentC!.id, status: 'failed' },
        { ...run, prId: second!.id, agentId: agentA!.id },
        { ...run, prId: second!.id, agentId: agentB!.id },
        { ...rerun, prId: second!.id, agentId: agentB!.id, status: 'running' },
        { ...rerun, prId: empty!.id, agentId: agentA!.id },
        { ...run, prId: empty!.id, agentId: agentA!.id },
        { ...rerun, workspaceId: foreign!.id, agentId: agentA!.id, status: 'failed', ranAt: new Date('2026-01-03') },
      ]).returning();
      const reviewFor = (r: typeof t.agentRuns.$inferSelect) => ({
        workspaceId, prId: r.prId!, agentId: r.agentId, runId: r.id, kind: 'review' as const,
      });
      const [
        previous, latest, otherAgent, failedAgentOld, secondReview, runningAgentOld, , emptyAgentOld,
        summary, foreignReview, unlinkedReview,
      ] = await db.insert(t.reviews).values([
        { ...reviewFor(previousA!), score: 70, createdAt: new Date('2026-01-02T00:02:00Z') },
        { ...reviewFor(latestA!), score: 54, createdAt: new Date('2026-01-02T00:01:00Z') },
        { ...reviewFor(latestB!), score: 55, createdAt: new Date('2026-01-02T00:03:00Z') },
        { ...reviewFor(previousC!), createdAt: new Date('2026-01-01') },
        reviewFor(secondRun!),
        reviewFor(previousSecond!),
        reviewFor(emptyRun!),
        reviewFor(previousEmpty!),
        { ...reviewFor(latestA!), score: 99, kind: 'summary', createdAt: new Date('2026-01-03') },
        { ...reviewFor(latestA!), score: 0, workspaceId: foreign!.id, createdAt: new Date('2026-01-04') },
        { workspaceId, prId: unlinked!.id, kind: 'review' },
      ]).returning();
      const finding = { file: 'src/input.ts', category: 'bug', confidence: 0.9, rationale: 'x'.repeat(400) };
      await db.insert(t.findings).values([
        ...[previous, failedAgentOld, runningAgentOld, emptyAgentOld, summary, foreignReview, unlinkedReview].map((r) => ({
          ...finding, reviewId: r!.id, title: 'Excluded critical', severity: 'CRITICAL', startLine: 1, endLine: 1,
        })),
        { ...finding, reviewId: latest!.id, title: 'Invalid severity', severity: 'INFO', startLine: 0, endLine: 0 },
        ...['SUGGESTION', 'CRITICAL', 'WARNING', 'CRITICAL', 'SUGGESTION'].map((severity, i) => ({
          ...finding, reviewId: latest!.id, title: `Finding ${i}`, severity, startLine: i + 1, endLine: i + 1,
        })),
        { ...finding, reviewId: otherAgent!.id, title: 'Other agent critical', severity: 'CRITICAL', startLine: 1, endLine: 1 },
        { ...finding, reviewId: otherAgent!.id, title: 'Other agent warning', severity: 'WARNING', startLine: 1, endLine: 1 },
        ...Array.from({ length: 100 }, (_, i) => ({
          ...finding, reviewId: secondReview!.id, title: `Suggestion ${i}`, severity: 'SUGGESTION', startLine: i + 1, endLine: i + 1,
        })),
      ]);
      const response = await app.inject({ url: `/repos/${repo.id}/pulls` });
      expect(response.statusCode).toBe(200);
      const rows = PrListItem.array().parse(response.json());
      const item = rows.find((row) => row.id === pr.id)!;
      expect(item.score).toBe(55);
      expect(item.findings_summary?.counts).toEqual({ critical: 3, warning: 2, suggestion: 2 });
      expect(item.findings_summary?.preview.map((entry) => entry.title)).toEqual(['Other agent critical', 'Finding 1', 'Finding 3']);
      expect(item.findings_summary?.preview[0]?.rationale).toHaveLength(280);
      const secondSummary = rows.find((row) => row.id === second!.id)?.findings_summary;
      expect(secondSummary?.counts).toEqual({ critical: 0, warning: 0, suggestion: 100 });
      expect(secondSummary?.preview.map((entry) => entry.title)).toEqual(['Suggestion 0', 'Suggestion 1', 'Suggestion 2']);
      expect(rows.find((row) => row.id === empty!.id)?.findings_summary).toEqual({
        counts: { critical: 0, warning: 0, suggestion: 0 }, preview: [],
      });
      expect(rows.find((row) => row.id === unlinked!.id)?.findings_summary).toBeNull();

      const fullResponse = await app.inject({ url: `/pulls/${pr.id}/findings` });
      expect(fullResponse.statusCode).toBe(200);
      const allFindings = FindingPreview.array().parse(fullResponse.json());
      expect(allFindings.map((entry) => entry.title)).toEqual([
        'Other agent critical', 'Finding 1', 'Finding 3', 'Other agent warning', 'Finding 2',
        'Finding 0', 'Finding 4',
      ]);
      const emptyResponse = await app.inject({ url: `/pulls/${empty!.id}/findings` });
      expect(emptyResponse.statusCode).toBe(200);
      expect(emptyResponse.json()).toEqual([]);
    } finally {
      await app.close();
    }
  });

  it('scopes reviews and finding actions to the workspace of the PR and the review', async () => {
    const { db } = pg.handle;
    const app = await appWith(REVIEW_FIXTURE);
    try {
      const { pr } = await setupRepoAndPr(db, workspaceId);
      const [foreign] = await db.insert(t.workspaces).values({ name: 'Review isolation' }).returning();
      const [localReview, foreignReview] = await db.insert(t.reviews).values([
        { workspaceId, prId: pr.id, kind: 'review' },
        { workspaceId: foreign!.id, prId: pr.id, kind: 'review' },
      ]).returning();
      const finding = {
        file: 'src/config.ts', startLine: 11, endLine: 11, severity: 'WARNING',
        category: 'bug', rationale: 'Check the configuration.', confidence: 0.9,
      };
      const [localFinding, foreignFinding] = await db.insert(t.findings).values([
        { ...finding, reviewId: localReview!.id, title: 'Local review finding' },
        { ...finding, reviewId: foreignReview!.id, title: 'Foreign review finding' },
      ]).returning();

      const response = await app.inject({ url: `/pulls/${pr.id}/reviews` });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual([
        expect.objectContaining({ id: localReview!.id, findings: [expect.objectContaining({ id: localFinding!.id })] }),
      ]);

      const action = await app.inject({ method: 'POST', url: `/findings/${foreignFinding!.id}/accept` });
      expect(action.statusCode).toBe(404);
      const [stored] = await db.select().from(t.findings).where(eq(t.findings.id, foreignFinding!.id));
      expect(stored?.acceptedAt).toBeNull();
    } finally {
      await app.close();
    }
  });

  it('returns the entire saved PR snapshot when refresh fails during replacement', async () => {
    const { db } = pg.handle;
    const commit = { sha: 'b2c3d4e5', message: 'Refine limiter', author: 'marisa.koch', committed_at: 'invalid-date' };
    const github = new MockGitHubClient({ detail: {
      body: 'Updated description.', additions: 5, deletions: 2, files_count: 1,
      files: [{ path: 'src/limiter.ts', additions: 5, deletions: 2 }],
      commits: [commit],
    } });
    const app = await buildApp({ config: config(), db, overrides: { github } });
    try {
      const { pr } = await setupRepoAndPr(db, workspaceId);
      await db.insert(t.prCommits).values({
        prId: pr.id, sha: pr.headSha, message: 'Add limiter', author: pr.author,
      });
      const url = `/pulls/${pr.id}`;

      const fallback = await app.inject({ url });
      expect(fallback.statusCode).toBe(200);
      expect(fallback.json()).toMatchObject({
        id: pr.id, body: pr.body, additions: 1, deletions: 0, files_count: 1,
        files: [{ path: 'src/config.ts', additions: 1, deletions: 0 }],
        commits: [{ sha: pr.headSha }],
      });

      commit.committed_at = '2026-01-02T00:00:00.000Z';
      const refreshed = await app.inject({ url });
      expect(refreshed.statusCode).toBe(200);
      expect(refreshed.json()).toMatchObject({ id: pr.id, body: 'Updated description.', commits: [commit] });
      expect(await db.select().from(t.prFiles).where(eq(t.prFiles.prId, pr.id)))
        .toMatchObject([{ path: 'src/limiter.ts' }]);
      expect(await db.select().from(t.prCommits).where(eq(t.prCommits.prId, pr.id)))
        .toMatchObject([{ sha: commit.sha }]);
    } finally {
      await app.close();
    }
  });

  it('totals all review runs per scoped PR, including reruns and missing traces', async () => {
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
      expect((await list()).map((item) => item.review_cost)).toEqual([null]);
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
      // Include both a manual rerun and a different agent with the same start time.
      const rerun = '00000000-0000-4000-8000-000000000002';
      const otherAgent = '00000000-0000-4000-8000-000000000001';
      const foreignRun = '00000000-0000-4000-8000-000000000003';
      const siblingRun = '00000000-0000-4000-8000-000000000004';
      await db.insert(t.agentRuns).values([
        { ...common, id: rerun, status: 'running', agentId: agentA!.id },
        { ...common, id: otherAgent, agentId: agentB!.id },
        { ...common, id: siblingRun, prId: sibling.pr.id, ranAt: new Date('2026-01-03') },
        { ...common, workspaceId: foreignWs!.id, prId: foreign.pr.id },
        // Separate FKs allow a malformed import to reference a PR in another workspace.
        { ...common, id: foreignRun, workspaceId: foreignWs!.id, ranAt: new Date('2026-01-04') },
      ]);
      const usage = (attempt_id: string, cost_usd: number | null) => ({ usage: { attempt_id, cost_usd } });
      await db.insert(t.runTraces).values([
        { runId: older!.id, trace: { log: [usage('1', 0.005)] } },
        { runId: otherAgent, trace: { log: [usage('1', 0.007)] } },
        { runId: foreignRun, trace: { log: [usage('1', 9)] } },
        { runId: siblingRun, trace: { log: [usage('1', 8)] } },
      ]);
      const selected = async () => {
        const items = await list();
        expect(items).toHaveLength(20);
        expect(items.filter(item => item.review_cost === null)).toHaveLength(19);
        return items.find(item => item.id === pr.id)!.review_cost;
      };
      expect(await selected()).toEqual({ running: true, cost_usd: null });
      await db.update(t.agentRuns).set({ status: 'failed' }).where(eq(t.agentRuns.id, rerun));
      expect(await selected()).toEqual({ running: true, cost_usd: null });
      await db.update(t.agentRuns).set({ status: 'done' }).where(eq(t.agentRuns.id, older!.id));
      expect(await selected()).toEqual({ running: false, cost_usd: null });
      const writeLog = (log: unknown[]) => db.insert(t.runTraces).values({ runId: rerun, trace: { log } })
        .onConflictDoUpdate({ target: t.runTraces.runId, set: { trace: { log } } });
      const repair = usage('2', 0.00612);
      await writeLog([usage('1', 0.00412), repair, usage('3', 0.004), repair, { cost_usd: 0.01424 }]);
      const total = await selected();
      expect(total?.running).toBe(false);
      expect(total?.cost_usd).toBeCloseTo(0.02624, 12);
      const traceCost = async (id: string) => (await app.inject({ url: `/runs/${id}/trace` })).json().stats.cost_usd;
      expect(await traceCost(older!.id)).toBe(0.005);
      expect(await traceCost(rerun)).toBe(0.01424);
      expect((await app.inject({ url: `/runs/${foreignRun}/trace` })).statusCode).toBe(404);
      const history = await app.inject({ url: `/pulls/${pr.id}/runs` });
      expect(history.statusCode).toBe(200);
      const runSummaries = history.json();
      expect(runSummaries).toHaveLength(3);
      expect(runSummaries).toEqual(expect.arrayContaining([
        expect.objectContaining({ run_id: older!.id, cost_usd: 0.005 }),
        expect.objectContaining({ run_id: rerun, status: 'failed', cost_usd: 0.01424 }),
        expect.objectContaining({ run_id: otherAgent, cost_usd: 0.007 }),
      ]));
      await db.update(t.agentRuns).set({ status: 'running' }).where(eq(t.agentRuns.id, rerun));
      expect(await selected()).toEqual({ running: true, cost_usd: null });
      const runningHistory = await app.inject({ url: `/pulls/${pr.id}/runs` });
      expect(runningHistory.json()).toContainEqual(expect.objectContaining({ run_id: rerun, cost_usd: null }));
      await db.update(t.agentRuns).set({ status: 'done' }).where(eq(t.agentRuns.id, rerun));
      await writeLog([usage('1', 0)]);
      expect(await selected()).toEqual({ running: false, cost_usd: 0.012 });
      expect(await traceCost(rerun)).toBe(0);
      await db.update(t.runTraces).set({ trace: { log: [usage('1', 0)] } })
        .where(inArray(t.runTraces.runId, [older!.id, otherAgent]));
      expect(await selected()).toEqual({ running: false, cost_usd: 0 });
      await db.update(t.runTraces).set({ trace: { log: [usage('1', 0.02)] } })
        .where(eq(t.runTraces.runId, otherAgent));
      for (const log of [[usage('1', 1), usage('2', null)], [{ msg: 'legacy' }]]) {
        await writeLog(log);
        expect(await selected()).toEqual({ running: false, cost_usd: null });
        expect(await traceCost(rerun)).toBeNull();
      }
      await writeLog([usage('1', Number.MAX_VALUE)]);
      await db.update(t.runTraces).set({ trace: { log: [usage('1', Number.MAX_VALUE)] } })
        .where(eq(t.runTraces.runId, otherAgent));
      expect(await selected()).toEqual({ running: false, cost_usd: null });
      expect((await app.inject({ url: `/repos/${foreign.repo.id}/pulls` })).statusCode).toBe(404);
      expect(llm.calls).toHaveLength(0);
    } finally {
      await app.close();
    }
  });

  it.each([
    { status: 'failed', duringSave: false },
    { status: 'cancelled', duringSave: false },
    { status: 'cancelled', duringSave: true },
  ] as const)('retains priced attempts in the saved $status trace (during save: $duringSave)', async ({ status, duringSave }) => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const fixture = status === 'failed' ? {} : REVIEW_FIXTURE;
    class PausedProvider extends MockLLMProvider {
      override async completeStructured<T>(req: StructuredRequest<T>) {
        if (!duringSave) {
          started();
          await gate;
        }
        return super.completeStructured(req);
      }
    }
    const started = vi.fn();
    const markReviewed = ReviewRepository.prototype.markReviewed;
    const pauseSave = duringSave ? vi.spyOn(ReviewRepository.prototype, 'markReviewed')
      .mockImplementation(async function (this: ReviewRepository, prId, sha) {
        started();
        await gate;
        return markReviewed.call(this, prId, sha);
      }) : undefined;
    const llm = new PausedProvider('openai', { structured: fixture });
    const app = await buildApp({ config: config(), db: pg.handle.db, overrides: {
      github: new MockGitHubClient({ pulls: [] }), llm: { openai: llm },
      git: new MockGitClient({ diff: duringSave ? DIFF : DIFF + '\n' + DIFF.replace(/config\.ts/g, 'second.ts') }),
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
      const cancel = async () => (await app.inject({ method: 'POST', url: `/runs/${runId}/cancel` })).json();
      if (status === 'cancelled') {
        const stream = app.inject({ url: `/runs/${runId}/events` });
        expect(await cancel()).toEqual({ ok: true, cancelled: true });
        expect(await cancel()).toEqual({ ok: true, cancelled: false });
        const ended = await stream;
        expect(ended.statusCode).toBe(200);
        expect(ended.payload).toContain('Cancellation requested');
        const history = await app.inject({ url: `/pulls/${pr.id}/runs` });
        expect(history.json()).toContainEqual(expect.objectContaining({ run_id: runId, status: 'cancelled' }));
      }
      release();
      await vi.waitFor(async () => {
        const res = await app.inject({ url: `/repos/${repo.id}/pulls` });
        expect(res.json()[0].review_cost).toEqual({ running: false, cost_usd: 0.001 });
      });
      const trace = (await app.inject({ url: `/runs/${runId}/trace` })).json();
      expect(trace.log.filter((line: { usage?: unknown }) => line.usage)).toEqual([
        expect.objectContaining({ usage: { attempt_id: '1', cost_usd: 0.001 } }),
      ]);
      const reviews = await app.inject({ url: `/pulls/${pr.id}/reviews` });
      expect(reviews.json()).toEqual([]);
    } finally {
      release();
      pauseSave?.mockRestore();
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
    const lateCancel = await app.inject({ method: 'POST', url: `/runs/${runId}/cancel` });
    expect(lateCancel.json()).toEqual({ ok: true, cancelled: false });
    const [afterCancel] = await pg.handle.db.select().from(t.agentRuns).where(eq(t.agentRuns.id, runId));
    expect(afterCancel!.status).toBe('done');
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
    // Wait for completion so this request exercises replay then stream closure.
    const body = (
      await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: agent.id } })
    ).json();
    const runId = body.runs[0].run_id;
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });

    const sse = await app.inject({ method: 'GET', url: `/runs/${runId}/events` });
    expect(sse.statusCode).toBe(200);
    expect(sse.headers['content-type']).toContain('text/event-stream');
    // The replay buffer should contain our log lines as SSE `data:` frames.
    expect(sse.payload).toContain('Starting review');
    expect(sse.payload).toContain('Citation grounding');
    const history = await app.inject({ url: `/pulls/${pr.id}/runs` });
    expect(history.json()).toContainEqual(expect.objectContaining({ run_id: runId, status: 'done' }));
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
