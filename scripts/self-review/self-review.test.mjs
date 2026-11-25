import { test } from 'node:test';
import { generateKeyPairSync } from 'node:crypto';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { review, exitCode, policyRoot } from '../pr-self-review.mjs';
import { openReviewedPR } from '../pr-open.mjs';
import { git } from './git.mjs';
import { catalog, route } from './skills.mjs';
import { candidate, evaluate } from './github-app.mjs';

function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'self-review-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const cwd = join(dir, 'repo');
  mkdirSync(cwd);
  git(cwd, ['init', '-b', 'main']);
  git(cwd, ['config', 'user.name', 'Test']);
  git(cwd, ['config', 'user.email', 'fixture@example.invalid']);
  function put(path, body) {
    mkdirSync(dirname(join(cwd, path)), { recursive: true });
    writeFileSync(join(cwd, path), body);
  }
  function commit(message) {
    git(cwd, ['add', '-A']);
    git(cwd, ['commit', '-m', message]);
  }
  const routeBody = (arg) => "import { stored } from './store.js';\n" + '\n'.repeat(8) + 'export const result = stored(' + JSON.stringify(arg) + ');\n';
  put('route.ts', routeBody('old'));
  put('store.ts', 'export const stored = (name: string) => name;\n');
  commit('base');
  git(cwd, ['switch', '-c', 'change']);
  return { opts: { cwd, stateDir: join(dir, 'state'), base: 'main', scope: 'change' }, put, commit, routeBody };
}

function answer(path, findings = []) {
  return { covered: [path], findings, incomplete: [], resolved: [] };
}
const critical = { severity: 'CRITICAL', issue: 'missing snapshot module', path: 'route.ts',
  line: 1, evidence: 'route.ts imports snapshot.js but the corresponding source is absent.', fix: 'Include snapshot.ts.' };

function withEvidence(ask) {
  return async (messages) => {
    const { verify } = JSON.parse(messages.at(-1).content);
    if (!verify) return ask(messages);
    const { path, after, candidatePaths } = JSON.parse(messages[1].content);
    const supported = verify.proposedResolution ? candidatePaths.includes('snapshot.ts') : !candidatePaths.includes('snapshot.ts');
    return { decision: supported ? 'supported' : 'disproved', reason: 'Checked source import against tree inventory',
      side: 'candidate', path, line: 1, quote: after.split('\n')[0] };
  };
}

test('reviews immutable committed, staged and working trees including untracked imports', async (t) => {
  const { opts, put, commit } = fixture(t);
  put('route.ts', "import { stored } from './snapshot.js';\nexport const result = stored('new');\n");
  commit('rename dependency');
  put('index.ts', 'export {};');
  git(opts.cwd, ['add', 'index.ts']);
  put('snapshot.ts', 'export const stored = (name: string) => name;');
  const before = git(opts.cwd, ['status', '--porcelain']);
  const ask = async (messages) => {
    const { path, candidatePaths } = JSON.parse(messages[1].content);
    return answer(path, path === 'route.ts' && !candidatePaths.includes('snapshot.ts') ? [critical] : []);
  };
  const reports = await review({ ...opts, ask: withEvidence(ask) });
  assert.deepEqual(reports.map((r) => [r.view, r.verdict]), [['commit','Blocked'],['index','Blocked'],['working','Pass']]);
  assert.equal(exitCode(reports), 1);
  assert.equal(git(opts.cwd, ['status', '--porcelain']), before);
});

test('supplies complete files and callers even if the import is outside the hunk', async (t) => {
  const { opts, put, commit, routeBody } = fixture(t);
  put('route.ts', routeBody('updated'));
  commit('update behavior');
  const ask = async (messages) => {
    const data = JSON.parse(messages[1].content);
    assert.match(data.after, /import \{ stored \}/);
    assert.doesNotMatch(data.diff, /^[+ -]import \{ stored \}/m);
    if (JSON.parse(messages.at(-1).content).verify) {
      return { decision: 'disproved', path: 'route.ts', side: 'candidate', line: 1,
        quote: 'import { stored }', reason: 'The complete source imports stored and its module exports it.' };
    }
    if (messages.length === 2) return { read: [{ side: 'candidate', path: 'store.ts' }] };
    assert.match(JSON.parse(messages.at(-1).content)[0].body, /export const stored/);
    return answer('route.ts', [{ ...critical, issue: 'missing stored import', evidence: 'Diff contains only a use.' }]);
  };
  const reports = await review({ ...opts, ask });
  assert.equal(exitCode(reports), 0, JSON.stringify(reports));
});

test('critical survives omission and same-tree retries, then clears with explicit evidence on a fix', async (t) => {
  const { opts, put, commit } = fixture(t);
  put('route.ts', "export * from './snapshot.js';");
  commit('missing dependency');
  const [bad] = await review({ ...opts, ask: withEvidence(async () => answer('route.ts', [critical])) });
  const id = bad.findings[0].id;
  const retry = async (messages) => {
    const { path } = JSON.parse(messages[1].content);
    return { ...answer(path), resolved: [{ id, evidence: 'snapshot.ts exists in the candidate.' }] };
  };
  assert.equal(exitCode(await review({ ...opts, ask: withEvidence(retry) })), 1);
  put('snapshot.ts', 'export const result = true;');
  commit('add module');
  assert.equal(exitCode(await review({ ...opts, ask: async (m) => answer(JSON.parse(m[1].content).path) })), 1);
  // A later fix changes the evidence and allows a verified resolution.
  put('route.ts', "export { result } from './snapshot.js';\n");
  commit('verify export');
  assert.equal(exitCode(await review({ ...opts, ask: withEvidence(retry) })), 0);
  assert.equal(exitCode(await review({ ...opts, ask: async () => ({}) })), 2);
});

test('mixed changes receive frontend, API, and security guides', () => {
  const guides = catalog(policyRoot);
  const ui = route('client/src/app/pulls/page.tsx', 'useQuery({ queryKey })', guides);
  for (const name of ['react-best-practices','next-best-practices','ui-styling']) assert.ok(ui.includes(name));
  const api = route('server/src/modules/pulls/routes.ts', 'workspaceId', guides);
  for (const name of ['onion-architecture','fastify-best-practices','security']) assert.ok(api.includes(name));
  assert.deepEqual(route('LICENSE', '', guides), ['general']);
});

test('hosted reviewer posts failure for a critical, then success for the repaired commit', async (t) => {
  const { opts, put, commit } = fixture(t);
  put('route.ts', "export * from './snapshot.js';");
  commit('missing module');
  const posted = [];
  const postApi = async (url, _token, data) => {
    if (url.endsWith('/access_tokens')) return { token: 'test' };
    posted.push({ url, ...data });
  };
  const config = { repo: 'org/repo', id: '123', state: opts.stateDir, key: generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey };
  const job = { installation: 3, scope: 'pr-1', target: git(opts.cwd, ['rev-parse','main']).trim() };
  const run = async (ask) => {
    job.head = git(opts.cwd, ['rev-parse','HEAD']).trim();
    await evaluate(job, config, { postApi, fetchUrl: opts.cwd, ask: withEvidence(ask) });
    return posted.at(-1);
  };
  assert.equal((await run(async () => answer('route.ts', [critical]))).state, 'failure');
  job.scope = 'pr-2';
  assert.equal((await run(async () => answer('route.ts'))).state, 'failure');
  put('snapshot.ts', 'export const stored = true;');
  commit('repair');
  const result = await run(async (m) => {
    const { path, prior } = JSON.parse(m[1].content);
    return { ...answer(path), resolved: prior.map(({ id }) => ({ id, evidence: 'Added snapshot.ts.' })) };
  });
  assert.deepEqual([result.url, result.context, result.state], ['/repos/org/repo/statuses/' + job.head, 'PR Self Review', 'success']);
});

test('direct PR and merge queue events use their own candidate and target SHAs', () => {
  const head = 'a'.repeat(40), target = 'b'.repeat(40);
  const payload = { repository: { full_name: 'org/repo' }, installation: { id: 9 }, number: 5, action: 'opened',
    pull_request: { base: { ref: 'main', sha: target }, head: { sha: head } } };
  assert.deepEqual(candidate('pull_request', payload, 'org/repo', 'main'), { head, target, scope: 'pr-5', installation: 9 });
  assert.equal(candidate('pull_request', payload, 'org/repo', 'other'), undefined);
  const queued = { ...payload, action: 'checks_requested', merge_group: { head_sha: target, base_sha: head, base_ref: 'refs/heads/main' } };
  assert.equal(candidate('merge_group', queued, 'org/repo', 'main').head, target);
});

test('local opening command stops before contacting GitHub on a critical', async (t) => {
  t.mock.method(console, 'log', () => {});
  const { opts, put, commit } = fixture(t);
  git(opts.cwd, ['remote', 'add', 'origin', 'https://github.com/example/fixture.git']);
  put('route.ts', "export * from './snapshot.js';");
  commit('missing module');
  const ask = withEvidence(async () => answer('route.ts', [critical]));
  const status = await openReviewedPR('main', { ...opts, ask }, () => assert.fail('PR creation was reached'));
  assert.equal(status, 1);
});

test('missing required guide marks the file incomplete', async (t) => {
  const { opts, put, commit } = fixture(t);
  put('client/src/hooks/cache.ts', 'export const refresh = () => invalidateQueries();');
  commit('change cache behavior');
  const guides = catalog(policyRoot);
  guides.delete('tanstack-query-best-practices');
  const [result] = await review({ ...opts, guides, ask: async () => assert.fail('Missing guide was ignored') });
  assert.equal(result.verdict, 'Incomplete');
  assert.match(result.incomplete[0].reason, /tanstack-query-best-practices/);
});
