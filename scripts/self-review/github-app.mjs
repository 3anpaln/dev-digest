import { createServer } from 'node:http';
import { createHmac, createSign, timingSafeEqual, randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { git } from './git.mjs';
import { review } from '../pr-self-review.mjs';

export function candidate(event, data, repo, base) {
  if (data.repository?.full_name !== repo) return;
  let head, target, scope;
  if (event === 'pull_request' && ['opened','reopened','synchronize','edited','ready_for_review'].includes(data.action)) {
    if (data.pull_request.base.ref !== base) return;
    head = data.pull_request.head.sha;
    target = data.pull_request.base.sha;
    scope = 'pr-' + data.number;
  } else if (event === 'merge_group' && data.action === 'checks_requested') {
    if (data.merge_group.base_ref !== 'refs/heads/' + base) return;
    head = data.merge_group.head_sha;
    target = data.merge_group.base_sha;
    scope = 'queue-' + head;
  } else return;
  if (![head,target].every((v) => /^[a-f0-9]{40}$/.test(v)) || !Number.isSafeInteger(data.installation?.id)) {
    throw new Error('Invalid webhook revision or installation');
  }
  return { head, target, scope, installation: data.installation.id };
}

function jwt(id, key) {
  const encode = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const body = encode({ alg: 'RS256', typ: 'JWT' }) + '.' + encode({ iat: now - 60, exp: now + 480, iss: id });
  return body + '.' + createSign('RSA-SHA256').update(body).sign(key, 'base64url');
}

async function post(path, token, body) {
  const res = await fetch('https://api.github.com' + path, {
    method: 'POST', signal: AbortSignal.timeout(30000),
    headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error('GitHub API returned ' + res.status);
  return res.json();
}

export async function evaluate(job, config, { postApi = post, fetchUrl = 'https://github.com/' + config.repo + '.git', ask } = {}) {
  const access = async () => (await postApi('/app/installations/' + job.installation + '/access_tokens',
    jwt(config.id, config.key), { repositories: [config.repo.split('/')[1]] })).token;
  const token = await access();
  const status = async (state, description, credential) => postApi('/repos/' + config.repo + '/statuses/' + job.head,
    credential, { state, context: 'PR Self Review', description });
  await status('pending', 'Reviewing candidate', token);
  const cwd = mkdtempSync(join(tmpdir(), 'trusted-pr-review-'));
  try {
    git(cwd, ['init', '--bare']);
    const auth = Buffer.from('x-access-token:' + token).toString('base64');
    git(cwd, ['fetch', '--no-tags', fetchUrl, job.target, job.head], {
      GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'http.https://github.com/.extraHeader',
      GIT_CONFIG_VALUE_0: 'Authorization: Basic ' + auth,
    });
    git(cwd, ['update-ref', 'HEAD', job.head]);
    const [report] = await review({ cwd, base: job.target, committedOnly: true, scope: job.scope, stateDir: config.state, serialized: true, ask });
    const path = join(config.state, job.head + '.json');
    writeFileSync(path, JSON.stringify(report, null, 2), { mode: 0o600 });
    const critical = report.findings.filter((f) => f.severity === 'CRITICAL');
    const summary = critical.length ? 'Blocked: ' + critical.length + ' critical. ' + critical[0].path + ':' + critical[0].line :
      report.verdict === 'Pass' ? 'All changed files reviewed' : 'Incomplete review. Inspect the trusted runner report.';
    await status(report.verdict === 'Pass' ? 'success' : 'failure', summary.slice(0, 130), await access());
  } catch (error) {
    await status('error', 'Incomplete review. Inspect the trusted runner.', await access());
    throw error;
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

export function startApp(env) {
  const config = { repo: env.PR_REVIEW_REPO, base: env.PR_REVIEW_BASE || 'main', id: env.GITHUB_APP_ID,
    key: readFileSync(env.GITHUB_APP_PRIVATE_KEY_FILE), state: resolve(env.PR_REVIEW_STATE_DIR) };
  if (!/^[\w.-]+\/[\w.-]+$/.test(config.repo) || !config.id || !env.GITHUB_WEBHOOK_SECRET ||
      !env.PR_SELF_REVIEW_MODEL || !env.OPENAI_API_KEY) throw new Error('Missing trusted runner configuration');
  const queue = join(config.state, 'queue');
  mkdirSync(queue, { recursive: true, mode: 0o700 });
  let busy = false;
  async function drain() {
    if (busy) return;
    busy = true;
    try {
      for (const name of readdirSync(queue).filter((f) => f.endsWith('.json')).sort()) {
        const file = join(queue, name);
        try {
          await evaluate(JSON.parse(readFileSync(file)), config);
          rmSync(file);
        } catch {
          console.error('Review job incomplete. Pending delivery will retry.');
        }
      }
    } catch {
      console.error('Unable to read the trusted review queue.');
    } finally {
      busy = false;
    }
  }
  setInterval(drain, 30000);
  void drain();
  return createServer(async (req, res) => {
    try {
      if (req.method !== 'POST') { res.writeHead(405).end(); return; }
      const chunks = [];
      let bytes = 0;
      for await (const chunk of req) {
        bytes += chunk.length;
        if (bytes > 4 * 1024 * 1024) { res.writeHead(413).end(); return; }
        chunks.push(chunk);
      }
      const body = Buffer.concat(chunks);
      const expected = 'sha256=' + createHmac('sha256', env.GITHUB_WEBHOOK_SECRET).update(body).digest('hex');
      const signature = Buffer.from(req.headers['x-hub-signature-256'] || '');
      if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(expected), signature)) {
        res.writeHead(401).end(); return;
      }
      const job = candidate(req.headers['x-github-event'], JSON.parse(body), config.repo, config.base);
      if (job) {
        const file = join(queue, Date.now() + '-' + randomUUID() + '.json');
        writeFileSync(file + '.tmp', JSON.stringify(job), { mode: 0o600 });
        renameSync(file + '.tmp', file);
      }
      res.writeHead(202).end();
      if (job) void drain();
    } catch { res.writeHead(400).end(); }
  }).listen(Number(env.PORT || 3002), '127.0.0.1');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) startApp(process.env);
