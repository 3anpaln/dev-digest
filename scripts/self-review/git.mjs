import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export function git(cwd, args, env = {}, input) {
  return execFileSync('git', args, {
    cwd, input, encoding: 'utf8', maxBuffer: 48 * 1024 * 1024, timeout: 120000,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_LITERAL_PATHSPECS: '1', ...env },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

export const nulList = (output) => output.split('\0').filter(Boolean);

export function restricted(path) {
  return /(^|\/)(?:\.env(?:\..+)?|[^/]+\.(?:pem|p12|pfx|key)|id_(?:rsa|ed25519))$/i.test(path)
    && !/(?:^|\/)\.env\.example$/.test(path);
}

export async function withSnapshots(cwd, base, committedOnly, run) {
  const head = git(cwd, ['rev-parse', '--verify', 'HEAD^{commit}']).trim();
  const baseCommit = git(cwd, ['rev-parse', '--verify', '--end-of-options', base + '^{commit}']).trim();
  const ancestor = git(cwd, ['merge-base', baseCommit, head]).trim();
  const tree = git(cwd, ['rev-parse', 'HEAD^{tree}']).trim();
  const views = [{ name: 'commit', tree }];
  const temp = mkdtempSync(join(tmpdir(), 'pr-self-review-'));
  try {
    const objects = join(temp, 'objects');
    mkdirSync(objects);
    const env = {
      GIT_OBJECT_DIRECTORY: objects,
      GIT_ALTERNATE_OBJECT_DIRECTORIES: git(cwd, ['rev-parse', '--path-format=absolute', '--git-path', 'objects']).trim(),
      GIT_INDEX_FILE: join(temp, 'index'),
    };
    if (!committedOnly) {
      if (git(cwd, ['ls-files', '--unmerged'])) throw new Error('Resolve index conflicts before review.');
      const entries = git(cwd, ['ls-files', '--stage', '-z']);
      git(cwd, ['update-index', '-z', '--index-info'], env, entries);
      const staged = git(cwd, ['write-tree'], env).trim();
      if (staged !== tree) views.push({ name: 'index', tree: staged });
      const pending = nulList(git(cwd, ['ls-files', '--modified', '--deleted', '--others', '--exclude-standard', '-z']));
      if (pending.some(restricted)) throw new Error('A pending credential file requires private review.');
      if (pending.length) {
        git(cwd, ['add', '-A', '--pathspec-from-file=-', '--pathspec-file-nul'], env, pending.join('\0') + '\0');
        const working = git(cwd, ['write-tree'], env).trim();
        if (working !== staged) views.push({ name: 'working', tree: working });
      }
    }
    return await run({ cwd, head, baseCommit, ancestor, env, views });
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}
