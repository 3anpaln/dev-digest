import { describe, expect, it } from 'vitest';
import type { StructuredRequest } from '@devdigest/shared';
import { MockLLMProvider } from '../src/adapters/mocks.js';
import { corroboratedConventions, eligiblePath, extractConventions, sourceWindows, type GroundedConvention } from '../src/modules/conventions/extract.js';

describe('conventions extraction', () => {
  it('grounds scoped alternatives, combines duplicate findings, and omits unsupported examples', async () => {
    const files = new Map<string, string[]>([
      ['src/billing/charge.ts', ['throw new BillingError();']],
      ['src/billing/refund.ts', ['throw new BillingError();']],
      ['src/search/query.ts', ['return { ok: false };']],
      ['src/search/index.ts', ['return { ok: false };']],
    ]);
    const cite = (path: string, line = 1) => ({ path, start_line: line, end_line: line });
    const billing = { rule: 'Throw typed billing errors', scope: 'src/billing/**', confidence: 0.9 };
    const search = { rule: 'Return a result object', scope: 'src/search/**', confidence: 0.8 };
    const provider = new MockLLMProvider('openai', { structuredBySchema: {
      repository_conventions: { findings: [
        { ...billing, evidence: [cite('src/billing/charge.ts'), cite('src/billing/charge.ts')] },
        { ...billing, evidence: [cite('src/billing/refund.ts'), cite('src/search/query.ts'), cite('missing.ts')] },
        { ...search, evidence: [cite('src/search/query.ts'), cite('src/search/index.ts'), cite('src/search/query.ts', 99)] },
        { ...billing, scope: 'Entire repository', evidence: [cite('src/billing/charge.ts'), cite('src/billing/charge.ts')] },
      ] },
    } });
    const grouped = new Map<string, GroundedConvention>();
    await extractConventions(provider, 'fixture', new Map([...files].map(([path, lines]) => [path, { firstLine: 1, lines }])), grouped);
    const results = corroboratedConventions(grouped);
    const request = provider.calls[0]?.req as StructuredRequest<unknown>;
    expect(request.messages[0]?.content).toContain('Write every finding rule in English only');
    expect(request).toMatchObject({ maxTokens: 5000, rejectTruncated: true });
    expect(results).toEqual([
      { ...billing, evidence: [expect.objectContaining({ path: 'src/billing/charge.ts' }), {
        ...cite('src/billing/refund.ts'), snippet: 'throw new BillingError();',
      }] },
      { ...search, evidence: ['src/search/query.ts', 'src/search/index.ts'].map((path) => ({
        ...cite(path), snippet: 'return { ok: false };',
      })) },
    ]);
  });

  it('filters known sensitive and generated paths before reading source', () => {
    expect(['src/.env.local', 'vendor/dep.ts', 'src/build/api.ts', 'src/../sample.ts', 'foo/server.p12'].filter(eligiblePath)).toEqual([]);
    expect(eligiblePath('src/billing/api.ts')).toBe(true);
  });

  it('combines evidence across batches and grounds absolute lines from later file windows', async () => {
    const file = 'src/one.ts';
    const windows = sourceWindows(file, Array(60).fill('x'.repeat(1000)).join('\n'));
    expect(windows).toHaveLength(2);
    const second = windows[1]!.window;
    const grouped = new Map<string, GroundedConvention>();
    async function add(path: string, firstLine: number, lines: string[]) {
      const provider = new MockLLMProvider('openai', { structuredBySchema: { repository_conventions: { findings: [{
        rule: 'Use named constants', scope: 'Entire repository', confidence: 0.9,
        evidence: [{ path, start_line: firstLine, end_line: firstLine }],
      }] } } });
      await extractConventions(provider, 'fixture', new Map([[path, { firstLine, lines }]]), grouped);
    }
    await add(file, second.firstLine, second.lines);
    expect(corroboratedConventions(grouped)).toEqual([]);
    await add('src/two.ts', 1, ['const VALUE = 1']);
    expect(corroboratedConventions(grouped)[0]?.evidence).toMatchObject([
      { path: file, start_line: second.firstLine, snippet: second.lines[0] },
      { path: 'src/two.ts', start_line: 1 },
    ]);
    expect(corroboratedConventions(grouped, false)).toEqual([]);
  });
});
