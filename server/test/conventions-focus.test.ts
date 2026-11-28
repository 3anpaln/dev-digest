import { describe, expect, it } from 'vitest';
import { validBranch } from '../src/modules/conventions/branch.js';
import { corroborationFiles, FOCUS_FILE_LIMIT, INITIAL_FILES, normalizeFocus, prioritizeFocusFiles, suggestFocus } from '../src/modules/conventions/focus.js';

describe('focused convention scans', () => {
  it('accepts named branches and rejects ref syntax that could resolve a different object', () => {
    expect(['main', 'feature/billing', 'release/v2.5', '-fix'].every(validBranch)).toBe(true);
    expect(['HEAD', 'head', 'main~1', 'branch@{1}', 'main:other', 'a..b', 'x//y', 'topic.lock'].some(validBranch)).toBe(false);
  });
  it('favors a web workflow using metadata and the available graph rank', () => {
    const paths = ['src/billing/routes.ts', 'src/billing/service.ts', 'src/settings/form.tsx', 'src/settings/store.ts'];
    expect(suggestFocus(paths, ['src/billing/routes.ts', 'src/billing/service.ts'], 'POST entry: src/billing/routes.ts')[0])
      .toBe('src/billing');
    expect(prioritizeFocusFiles(paths, 'src/billing', ['src/billing/service.ts']))
      .toEqual(['src/billing/service.ts', 'src/billing/routes.ts']);
  });

  it('falls back to tracked paths for a library with no routes or index', () => {
    const paths = ['lib/public.rb', 'lib/internal/cache.rb', 'lib/internal/store.rb', 'tests/public_test.rb'];
    expect(suggestFocus(paths, [], '')).toContain('lib');
    expect(prioritizeFocusFiles(paths, 'lib', [])).toHaveLength(3);
    expect(suggestFocus(['Dockerfile', 'Makefile'], [], '')).toEqual(['.']);
    expect(suggestFocus(['README.md'], [], '')).toEqual([]);
  });

  it('keeps monorepo packages separate and reserves the remaining budget for relevant files', () => {
    const selected = Array.from({ length: 30 }, (_, index) => 'packages/api/src/file-' + String(index).padStart(2, '0') + '.go');
    const other = ['packages/api-extra/main.go', 'packages/worker/src/main.rs'];
    const paths = prioritizeFocusFiles([...other, ...selected], 'packages/api', []);
    expect(paths).toEqual(selected);
    const first = paths[0]!;
    const followUp = corroborationFiles(paths.slice(INITIAL_FILES), [{
      rule: 'Wrap domain errors', scope: 'packages/api/**', confidence: 0.8,
      evidence: [{ path: first, start_line: 1, end_line: 1, snippet: 'return domainError' }],
    }]).slice(0, FOCUS_FILE_LIMIT - INITIAL_FILES);
    expect(paths.slice(0, INITIAL_FILES).concat(followUp)).toHaveLength(20);
    expect(corroborationFiles(paths, [])).toEqual([]);
    expect(normalizeFocus('../outside')).toBeNull();
  });
});
