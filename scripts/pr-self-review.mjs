import { existsSync, mkdirSync, readFileSync, renameSync, rmdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { git, withSnapshots } from './self-review/git.mjs';
import { catalog } from './self-review/skills.mjs';
import { digest, reviewView } from './self-review/review.mjs';

export const policyRoot = dirname(dirname(fileURLToPath(import.meta.url)));

export async function review({ cwd, base, committedOnly = false, stateDir, scope, ask, guides = catalog(policyRoot), serialized = false }) {
  if (!ask && (!process.env.OPENAI_API_KEY || !process.env.PR_SELF_REVIEW_MODEL)) {
    throw new Error('Configure the review model and API key as described in docs/pr-self-review.md.');
  }
  const store = join(stateDir, digest(scope));
  mkdirSync(store, { recursive: true });
  const lock = join(store, 'running');
  if (!serialized) mkdirSync(lock);
  try {
    return await withSnapshots(cwd, base, committedOnly, async (snapshot) => {
      const reports = [];
      for (const view of snapshot.views) {
        const file = join(store, view.name + '.json');
        // GitHub associates the result with the candidate SHA across PR numbers.
        const treeFile = join(serialized ? stateDir : store, view.tree + '.json');
        const known = [file, treeFile].flatMap((path) => existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : []);
        const prior = [...new Map(known.map((finding) => [finding.id, finding])).values()];
        const report = await reviewView(snapshot, view, guides, prior, ask, policyRoot);
        const blockers = report.findings.filter((f) => f.severity === 'CRITICAL')
          .map((f) => ({ ...f, tree: view.tree }));
        for (const path of [treeFile, file]) {
          writeFileSync(path + '.tmp', JSON.stringify(blockers), { mode: 0o600 });
          renameSync(path + '.tmp', path);
        }
        reports.push(report);
      }
      return reports;
    });
  } finally {
    if (!serialized) rmdirSync(lock);
  }
}

export function localOptions(base) {
  const cwd = git(process.cwd(), ['rev-parse', '--show-toplevel']).trim();
  const branch = git(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']).trim();
  return { cwd, base, scope: branch + '\0' + base, stateDir: join(cwd, '.devdigest/cache/pr-self-review') };
}

export function baseArg(args, fallback) {
  if (!args.length) return fallback;
  if (args.length !== 2 || args[0] !== '--base' || !args[1] || args[1].startsWith('-')) throw new Error('Expected --base <target>');
  return args[1];
}

export function exitCode(reports) {
  return reports.some((r) => r.verdict === 'Blocked') ? 1 : reports.some((r) => r.verdict !== 'Pass') ? 2 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const reports = await review(localOptions(baseArg(process.argv.slice(2), 'origin/main')));
    console.log(JSON.stringify(reports, null, 2));
    process.exitCode = exitCode(reports);
  } catch (error) {
    console.error('Incomplete:', error.message.split('\n')[0]);
    process.exitCode = 2;
  }
}
