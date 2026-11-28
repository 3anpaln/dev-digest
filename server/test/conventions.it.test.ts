import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { MockGitClient, MockLLMProvider } from '../src/adapters/mocks.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { dockerAvailable, startPg } from './helpers/pg.js';
import { waitForPrRuns } from './helpers/runs.js';
import type { StructuredRequest } from '@devdigest/shared';

const suite = await dockerAvailable() ? describe : describe.skip;

suite('conventions and workspace skill lifecycle', () => {
  it('reuses scans and decisions, saves one private skill and uses its reviewed body', async () => {
    const pg = await startPg();
    const { db } = pg.handle;
    const local = await seed(db);
    const [repo] = await db.select().from(t.repos).where(eq(t.repos.workspaceId, local.workspaceId));
    const [pr] = await db.select().from(t.pullRequests).where(eq(t.pullRequests.repoId, repo!.id));
    const [other] = await db.insert(t.workspaces).values({ name: 'Other workspace' }).returning();
    const commit = 'a'.repeat(40);
    let currentCommit = commit;
    const branch = 'feature/billing';
    const featureCommit = 'f'.repeat(40);
    let branchSynced = false;
    const evidenceFiles = {
      'src/billing/order.ts': 'throw new BillingError();\nreturn result;',
      'src/billing/refund.ts': 'throw new BillingError();\nreturn result;\n// Refund handling',
    };
    const files = {
      ...evidenceFiles,
      ...Object.fromEntries(Array.from({ length: 25 }, (_, index) => ['src/unrelated/extra-' + index + '.py', 'value = ' + index])),
      ...Object.fromEntries(Array.from({ length: 25 }, (_, index) => ['src/wide/file-' + String(index).padStart(2, '0') + '.go', 'var value = ' + index])),
      'lib/entry.ts': 'export const LIBRARY_ENTRY = 1;',
      'packages/core/entry.ts': 'export const CORE_ENTRY = 1;',
      'packages/core/duplicate.ts': 'export const LIBRARY_ENTRY = 1;',
      'vendor/third-party.ts': 'DO_NOT_SCAN_VENDOR',
      'src/billing/oversized.ts': 'x'.repeat(64 * 1024 + 1),
      'src/.env.local': 'SKIP_THIS_FILE',
    };
    await db.update(t.repos).set({ clonePath: '/fixture/clone' }).where(eq(t.repos.id, repo!.id));
    const proposal = (rule: string, line: number) => ({
      rule, scope: 'src/billing/**', confidence: 0.9,
      evidence: Object.keys(evidenceFiles).map((path) => ({ path, start_line: line, end_line: line })),
    });
    const kept = proposal('Use typed domain errors', 1);
    const removed = proposal('Return a result', 2);
    const added = proposal('Return the operation outcome', 2);
    const fixture: { findings: unknown } = { findings: [kept, removed] };
    const provider = new MockLLMProvider('openai', {
      structuredBySchema: { repository_conventions: fixture },
      structured: { verdict: 'approve', summary: 'Looks good', score: 100, findings: [] },
    });
    let releaseScan!: () => void;
    const scanGate = new Promise<void>((resolve) => { releaseScan = resolve; });
    const git = new MockGitClient({ head: commit, files });
    git.branchHead = async (_repo, selectedBranch) => {
      if (selectedBranch === 'main') return currentCommit;
      if (selectedBranch === branch && branchSynced) return featureCommit;
      throw new Error('Missing local branch');
    };
    git.fetchBranch = async (_repo, selectedBranch) => { branchSynced = selectedBranch === branch; };
    const originalRead = git.readSourceAt.bind(git);
    git.readSourceAt = async (...args) => {
      await scanGate;
      return originalRead(...args);
    };
    const app = await buildApp({
      config: loadConfig({ ...process.env, NODE_ENV: 'test' }), db,
      overrides: {
        git, llm: { openai: provider },
        auth: {
          async currentUser() { return { id: local.userId, email: 'local@example.invalid', name: 'Local reviewer' }; },
          async currentWorkspace(req) {
            return (req as { headers: Record<string, string> }).headers['x-test-workspace']
              ? other! : { id: local.workspaceId, name: 'Source workspace' };
          },
        },
      },
    });
    const base = '/repos/' + repo!.id + '/conventions';
    const foreign = { 'x-test-workspace': 'other' };
    const getPage = async () => (await app.inject({ url: base })).json();
    const edit = (candidate: { id: string; revision: string }, changes: object) => app.inject({
      method: 'PATCH', url: base + '/findings/' + candidate.id, payload: { revision: candidate.revision, ...changes },
    });
    const scan = () => app.inject({ method: 'POST', url: base + '/scan', payload: { directory: 'src/billing' } });
    try {
      expect((await getPage()).readiness).toBe('ready');
      expect((await app.inject({ method: 'POST', url: base + '/scan', payload: { directory: '../outside' } })).statusCode).toBe(422);
      expect((await app.inject({ method: 'POST', url: base + '/scan', payload: { maxResponseTokens: 0 } })).statusCode).toBe(422);
      const started = await scan();
      expect(started.statusCode).toBe(202);
      expect(started.json()).toMatchObject({ branch: 'main', commit, max_response_tokens: 5000, file_limit: 20 });
      expect((await scan()).json().id).toBe(started.json().id);
      currentCommit = 'd'.repeat(40);
      releaseScan();
      await app.container.jobs.onIdle();
      const page = await getPage();
      expect(page.successful).toMatchObject({ files_analyzed: 2, branch_files_skipped: 1, focus_directory: 'src/billing', commit });
      const request = provider.calls[0]?.req as StructuredRequest<unknown>;
      expect(request.messages[1]?.content).not.toContain('src/unrelated/');
      expect(request.messages[1]?.content).not.toContain('SKIP_THIS_FILE');
      expect(page.attempts).toEqual([expect.objectContaining({
        id: started.json().id, status: 'done', queued_at: expect.any(String), findings_count: 2,
        max_response_tokens: 5000,
        selected_files: Object.keys(evidenceFiles),
        skipped_files: [{ path: 'src/billing/oversized.ts', reason: 'oversized_or_unavailable' }],
        commit_url: 'https://github.com/acme/payments-api/commit/' + commit,
        branch_url: 'https://github.com/acme/payments-api/tree/main',
        model_choice: { provider: 'openai', model: expect.any(String) },
      })]);
      expect(page.findings).toHaveLength(2);
      const byRule = (result: typeof page, rule: string) => result.findings.find((finding: { rule: string }) => finding.rule === rule);
      const finding = byRule(page, kept.rule);
      expect(finding.evidence[0].url).toContain('/blob/' + commit + '/');
      expect((await edit(finding, { decision: 'accepted', scope: 'src/billing/domain/**' })).statusCode).toBe(200);
      const earlierDecision = await edit(byRule(page, removed.rule), { decision: 'accepted' });
      expect(earlierDecision.statusCode).toBe(200);
      expect(earlierDecision.json().decided_at).toEqual(expect.any(String));
      const draft = (await app.inject({ url: base + '/skill-draft' })).json();
      expect(draft.body).toContain('src/billing/domain/**');

      fixture.findings = [kept, added];
      currentCommit = 'b'.repeat(40);
      expect((await scan()).statusCode).toBe(202);
      await app.container.jobs.onIdle();
      const rescanned = await getPage();
      expect(rescanned.successful.changes).toEqual({ decisions_kept: 2, new_findings: 1, reviewed_not_rediscovered: 1 });
      expect(byRule(rescanned, removed.rule)).toMatchObject({
        decision: 'accepted', decided_at: earlierDecision.json().decided_at, carried_forward: true,
        evidence: earlierDecision.json().evidence,
      });
      expect(byRule(rescanned, kept.rule)).toMatchObject({ scope: 'src/billing/domain/**', decision: 'accepted' });
      expect(byRule(rescanned, kept.rule).evidence[0].url).toContain('/blob/' + currentCommit + '/');
      expect((await edit(byRule(rescanned, added.rule), { decision: 'rejected' })).statusCode).toBe(200);
      const requestId = crypto.randomUUID();
      const confirm = (revision: string) => app.inject({ method: 'POST', url: base + '/skills', payload: {
        requestId, revision, name: 'Billing conventions', description: '', body: '  Approved instructions\n',
      } });
      expect((await confirm(draft.revision)).statusCode).toBe(409);
      const currentDraft = (await app.inject({ url: base + '/skill-draft' })).json();
      expect(currentDraft.body).not.toContain(added.rule);
      expect(currentDraft.body).toContain(removed.rule);
      const created = await confirm(currentDraft.revision);
      expect(created.statusCode).toBe(201);
      const skill = created.json();
      expect(skill).toMatchObject({ id: requestId, type: 'convention', source: 'extracted', enabled: false, body: '  Approved instructions\n' });
      expect((await confirm(currentDraft.revision)).json()).toEqual(skill);
      expect((await app.inject({ url: '/skills/' + requestId + '/versions' })).json()).toMatchObject([{ version: 1, body: skill.body }]);
      expect((await app.inject({ url: '/skills', headers: foreign })).json()).not.toContainEqual(expect.objectContaining({ id: requestId }));
      expect((await app.inject({ url: base, headers: foreign })).statusCode).toBe(404);
      expect((await app.inject({ url: base + '/skill-draft', headers: foreign })).statusCode).toBe(404);

      const agent = (await app.inject({ method: 'POST', url: '/agents', payload: {
        name: 'Billing reviewer', provider: 'openai', model: 'fixture', system_prompt: 'Review changes',
      } })).json();
      expect((await app.inject({ method: 'POST', url: '/agents/' + agent.id + '/skills', payload: { skill_ids: [skill.id] } })).statusCode).toBe(200);
      expect((await app.inject({ method: 'PUT', url: '/skills/' + skill.id, payload: { revision: skill.revision, enabled: true } })).statusCode).toBe(200);
      const review = await app.inject({ method: 'POST', url: '/pulls/' + pr!.id + '/review', payload: { agentId: agent.id } });
      expect(review.statusCode).toBe(200);
      const runs = await waitForPrRuns(db, pr!.id);
      expect(runs.find((run) => run.id === review.json().runs[0].run_id)?.status).toBe('done');
      const reviewRequest = provider.calls.map(({ req }) => req as StructuredRequest<unknown>)
        .find(({ schemaName }) => schemaName !== 'repository_conventions');
      expect(reviewRequest?.messages.map(({ content }) => content).join('\n')).toContain('## Skills / rules\n  Approved instructions');

      fixture.findings = null;
      expect((await scan()).statusCode).toBe(202);
      await app.container.jobs.onIdle();
      const failed = await getPage();
      expect(failed.latest.status).toBe('failed');
      expect(failed.successful.id).toBe(rescanned.successful.id);
      expect(failed.attempts).toMatchObject([
        { status: 'failed', findings_count: null, model_choice: page.attempts[0].model_choice,
          selected_files: Object.keys(evidenceFiles),
          skipped_files: [{ path: 'src/billing/oversized.ts', reason: 'oversized_or_unavailable' }] },
        { status: 'done', findings_count: 2 },
        { status: 'done', findings_count: 2 },
      ]);
      const legacyFindings = [
        { rule: 'Legacy finding with a missing original scope', originalScope: null },
        { rule: 'Legacy finding with a blank original scope', originalScope: '' },
      ];
      const legacyEvidence = { path: 'src/billing/order.ts', start_line: 1, end_line: 1, snippet: 'throw new BillingError();' };
      await db.insert(t.conventions).values(legacyFindings.map((finding) => ({
        ...finding, workspaceId: local.workspaceId, repoId: repo!.id, scanId: started.json().id,
        scope: kept.scope, confidence: kept.confidence, decision: 'accepted' as const, accepted: true,
        evidence: [legacyEvidence], evidencePath: legacyEvidence.path, evidenceSnippet: legacyEvidence.snippet,
      })));
      fixture.findings = Array.from({ length: 8 }, (_, index) => proposal('Scoped billing pattern ' + index, 1));
      const nextScan = await scan();
      expect(nextScan.statusCode).toBe(202);
      await app.container.jobs.onIdle();
      const focused = await getPage();
      expect(focused.successful).toMatchObject({ id: nextScan.json().id, status: 'done' });
      for (const legacy of legacyFindings) expect(byRule(focused, legacy.rule)).toBeUndefined();
      expect(focused.findings.filter(({ decision }: { decision: string }) => decision === 'pending')).toHaveLength(5);
      expect(focused.findings.filter(({ decision }: { decision: string }) => decision === 'accepted')).toHaveLength(2);
      fixture.findings = [{
        rule: 'Declare defaults alongside their consumers',
        scope: 'Entire repository', confidence: 0.9,
        evidence: ['00', '19', '20'].map((index) => ({ path: 'src/wide/file-' + index + '.go', start_line: 1, end_line: 1 })),
      }];
      const batchStart = provider.calls.length;
      expect((await app.inject({ method: 'POST', url: base + '/scan', payload: {
        directory: 'src/wide', fileLimit: 20, maxResponseTokens: 7500,
      } })).statusCode).toBe(202);
      await app.container.jobs.onIdle();
      const budgeted = await getPage();
      expect(budgeted.successful).toMatchObject({ files_analyzed: 20, file_budget_reached: true, focus_directory: 'src/wide' });
      expect(budgeted.attempts[0].max_response_tokens).toBe(7500);
      expect(provider.calls.slice(batchStart).map(({ req }) => (req as StructuredRequest<unknown>).maxTokens)).toEqual([7500, 7500]);
      expect(budgeted.successful.selected_files).toHaveLength(20);
      expect(budgeted.successful.selected_files.every((path: string) => path.startsWith('src/wide/'))).toBe(true);
      expect(byRule(budgeted, 'Declare defaults alongside their consumers')).toMatchObject({
        scope: 'src/wide/**',
        evidence: [expect.objectContaining({ path: 'src/wide/file-00.go' }), expect.objectContaining({ path: 'src/wide/file-19.go' })],
      });
      expect((await app.inject({ method: 'POST', url: base + '/scan', payload: { fileLimit: 3 } })).statusCode).toBe(202);
      await app.container.jobs.onIdle();
      expect((await getPage()).successful).toMatchObject({ files_analyzed: 3, file_limit: 3, file_budget_reached: true });
      expect((await app.inject({ method: 'POST', url: base + '/scan', payload: { fileLimit: 0, directory: 'src/wide/' } })).statusCode).toBe(202);
      await app.container.jobs.onIdle();
      const folder = (await getPage()).successful;
      expect(folder).toMatchObject({ files_analyzed: 25, file_limit: 0, focus_directory: 'src/wide', file_budget_reached: false });
      expect(folder.selected_files).toHaveLength(25);
      const callsBefore = provider.calls.length;
      expect((await app.inject({ method: 'POST', url: base + '/scan', payload: { fileLimit: 0, directory: '' } })).statusCode).toBe(202);
      await app.container.jobs.onIdle();
      const full = await getPage();
      expect(full.successful).toMatchObject({
        files_analyzed: 54, branch_files_skipped: 2, file_limit: 0, focus_directory: null, file_budget_reached: false,
      });
      expect(full.successful.skipped_files).toEqual(expect.arrayContaining([
        { path: 'src/billing/oversized.ts', reason: 'oversized_or_unavailable' },
        { path: 'packages/core/duplicate.ts', reason: 'duplicate' },
      ]));
      const modelInputs = provider.calls.slice(callsBefore).map(({ req }) => (req as StructuredRequest<unknown>).messages[1]?.content).join('\n');
      expect(modelInputs).toContain('lib/entry.ts');
      expect(modelInputs).toContain('packages/core/entry.ts');
      expect(modelInputs).not.toContain('packages/core/duplicate.ts');
      expect(modelInputs).not.toContain('DO_NOT_SCAN_VENDOR');
      const query = '?branch=' + encodeURIComponent(branch);
      const scanFeature = () => app.inject({ method: 'POST', url: base + '/scan', payload: { branch, directory: 'src/billing' } });
      expect((await app.inject({ url: base + query })).json()).toMatchObject({ latest: null, findings: [], attempts: [] });
      expect((await scanFeature()).json().error.code).toBe('branch_unavailable');
      expect((await app.inject({ method: 'POST', url: base + '/branch/sync', payload: { branch } })).statusCode).toBe(200);
      fixture.findings = [kept];
      expect((await scanFeature()).statusCode).toBe(202);
      await app.container.jobs.onIdle();
      const feature = (await app.inject({ url: base + query })).json();
      expect(feature.successful).toMatchObject({ branch, commit: featureCommit,
        branch_url: 'https://github.com/acme/payments-api/tree/feature/billing' });
      expect(feature.findings).toMatchObject([{ rule: kept.rule, decision: 'pending' }]);
      expect(feature.attempts.every((attempt: { branch: string }) => attempt.branch === branch)).toBe(true);
      expect((await app.inject({ url: base + '/skill-draft' + query })).statusCode).toBe(409);
      expect((await app.inject({
        method: 'PATCH', url: base + '/findings/' + feature.findings[0].id + query,
        payload: { revision: feature.findings[0].revision, decision: 'accepted' },
      })).statusCode).toBe(200);
      const clearUrl = base + '/decisions/clear';
      expect((await app.inject({ method: 'POST', url: clearUrl, headers: foreign })).statusCode).toBe(404);
      const cleared = await app.inject({ method: 'POST', url: clearUrl });
      expect(cleared.statusCode).toBe(200);
      expect(cleared.json().findings).toEqual(full.findings.map((finding: Record<string, unknown>) =>
        expect.objectContaining({ ...finding, decision: 'pending', accepted: false, decided_at: null, revision: expect.any(String) })));
      expect((await app.inject({ url: base + '/skill-draft' })).statusCode).toBe(409);
      expect((await app.inject({ url: base + '/skill-draft' + query })).statusCode).toBe(200);
      expect((await app.inject({ url: '/skills/' + skill.id + '/versions' })).statusCode).toBe(200);
      expect((await scan()).statusCode).toBe(202);
      await app.container.jobs.onIdle();
      expect((await getPage()).findings.every(({ decision }: { decision: string }) => decision === 'pending')).toBe(true);
    } finally {
      releaseScan();
      await app.container.jobs.onIdle();
      await app.close();
      await pg.stop();
    }
  }, 120_000);
});
