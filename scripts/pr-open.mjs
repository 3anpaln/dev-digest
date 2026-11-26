import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { baseArg, exitCode, localOptions, review } from './pr-self-review.mjs';
import { git, withSnapshots } from './self-review/git.mjs';

export async function openReviewedPR(base, opts = localOptions('origin/' + base), create = execFileSync) {
  const branch = git(opts.cwd, ['symbolic-ref', '--short', 'HEAD']).trim();
  const origin = git(opts.cwd, ['remote', 'get-url', 'origin']).trim();
  const repo = /^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([\w.-]+\/[\w.-]+?)(?:\.git)?\/?$/.exec(origin)?.[1];
  if (!repo || branch === base) throw new Error('Use a feature branch with a GitHub origin.');
  const reports = await review(opts);
  console.log(JSON.stringify(reports, null, 2));
  const code = exitCode(reports);
  if (!code) {
    const unchanged = await withSnapshots(opts.cwd, opts.base, false, async (snapshot) =>
      snapshot.views.length === reports.length && snapshot.views.every((view, index) =>
        reports[index].view === view.name && reports[index].tree === view.tree));
    if (!unchanged) throw new Error('Pending changes moved during review. Run the review again.');
    const remote = git(opts.cwd, ['ls-remote', '--heads', 'origin', 'refs/heads/' + base, 'refs/heads/' + branch]);
    const refs = new Map(remote.trim().split('\n').map((line) => line.split('\t').reverse()));
    if (git(opts.cwd, ['rev-parse', 'HEAD']).trim() !== reports[0].head ||
        refs.get('refs/heads/' + branch) !== reports[0].head || refs.get('refs/heads/' + base) !== reports[0].base) {
      throw new Error('The published head or target differs from the reviewed revision. Sync the refs and review again.');
    }
    create('gh', ['pr', 'create', '--repo', repo, '--base', base, '--head', branch, '--fill'], { stdio: 'inherit' });
  }
  return code;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = await openReviewedPR(baseArg(process.argv.slice(2), 'main'));
  } catch (error) {
    console.error('Incomplete:', error.message.split('\n')[0]);
    process.exitCode = 2;
  }
}
