import { expect, it, vi } from 'vitest';
import { z } from 'zod';
import { AttemptCosts, OpenRouterProvider, reviewPullRequest } from '../src/index.js';
import { MockGitClient } from '../../server/src/adapters/mocks.js';

it('pins the OpenRouter endpoint even when OPENAI_BASE_URL is set', async () => {
  vi.stubEnv('OPENAI_BASE_URL', 'https://example.invalid/v1');
  const fetch = vi.fn(async () => Response.json({
    choices: [{ message: { content: '{}' } }],
  }));
  try {
    const provider = new OpenRouterProvider('test', { fetch, maxRetries: 0 });
    await provider.completeStructured({
      model: 'test', schema: z.object({}), schemaName: 'Review', messages: [],
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith('https://openrouter.ai/api/v1/chat/completions', expect.anything());
  } finally {
    vi.unstubAllEnvs();
  }
});

it('prefers reported charges and estimates only complete, priceable usage', () => {
  const record = vi.fn();
  const estimate = vi.fn(() => 0.003);
  const costs = new AttemptCosts('model', estimate, record);
  costs.response(0, 10, 20);
  costs.response(0.007, undefined, undefined);
  costs.response(-1, 10, 20);
  costs.response(Infinity, 10, 20);
  costs.response(NaN, undefined, 20);
  costs.response(undefined, 0.5, 20);
  costs.response(undefined, 10, -1);
  new AttemptCosts('unknown', () => null, record).response(null, 10, 20);
  expect(record.mock.calls.flat()).toEqual([0, 0.007, 0.003, 0.003, null, null, null, null]);
  expect(estimate).toHaveBeenCalledTimes(2);
  expect(estimate).toHaveBeenCalledWith('model', 10, 20);
  expect(costs.total).toBeNull();
});

it.each([NaN, Infinity, -Infinity, -1])('records invalid direct cost %s as unknown', (invalid) => {
  const onAttemptCost = vi.fn();
  const costs = new AttemptCosts('model', undefined, onAttemptCost);
  costs.record(0);
  expect(costs.total).toBe(0);
  costs.record(invalid);
  costs.record(0.01);
  expect(costs.total).toBeNull();
  expect(onAttemptCost.mock.calls).toEqual([[0], [null], [0.01]]);
});

it('retains a recognized network code for retry decisions', () => {
  const costs = new AttemptCosts('test');
  const error = Object.assign(new Error('private provider diagnostic'), { code: 'ECONNRESET' });
  expect(() => costs.failed(error)).toThrow(expect.objectContaining({
    message: 'Provider request failed',
    code: 'ECONNRESET',
  }));
  expect(costs.total).toBeNull();
});

it.each([
  { status: 401, message: 'Provider request failed (HTTP 401)' },
  { status: 200, message: 'OpenRouter returned no choices for Review' },
])('keeps upstream error details private for HTTP $status', async ({ status, message }) => {
  const marker = 'private provider diagnostic';
  const fetch = vi.fn(async () => Response.json({ error: { message: marker } }, {
    status, headers: { 'x-diagnostic': marker },
  }));
  const llm = new OpenRouterProvider('test', { fetch, maxRetries: 0 });
  const onAttemptCost = vi.fn();
  const error = await llm.completeStructured({
    model: 'test', schema: z.object({}), schemaName: 'Review', messages: [], onAttemptCost,
  }).catch((failure: unknown) => failure);
  expect(error).toBeInstanceOf(Error);
  expect(error).toHaveProperty('message', message);
  expect(error).not.toHaveProperty('cause');
  expect(error).not.toHaveProperty('headers');
  expect(error).not.toHaveProperty('error');
  expect(JSON.stringify(error)).not.toContain(marker);
  expect(onAttemptCost.mock.calls).toEqual([[null]]);
});

it.each([
  { retry: false, cancel: false },
  { retry: true, cancel: false },
  { retry: false, cancel: true },
  { retry: true, cancel: true },
])('accounts for dispatched attempts (transport retry: $retry, cancel: $cancel)', async ({ retry, cancel }) => {
  const valid = JSON.stringify({ verdict: 'approve', summary: 'OK', score: 100, findings: [] });
  const replies = [
    ...(retry ? [{ status: 503 }] : []),
    { status: 200, raw: '{}', cost: 0.00412 },
    { status: 200, raw: valid, cost: 0.00612 },
    { status: 200, raw: valid, cost: 0.004 },
  ];
  const fetch = vi.fn(async (_url: unknown) => {
    const reply = replies.shift();
    return Response.json(reply && 'raw' in reply ? {
      choices: [{ message: { content: reply.raw } }], usage: { cost: reply.cost },
    } : { error: { message: 'Unavailable' } }, {
      status: reply?.status ?? 400,
      headers: { 'retry-after-ms': '1' },
    });
  });
  // A legacy caller can still pass an extra property at runtime.
  const options = { fetch, maxRetries: 1, baseURL: 'https://example.invalid/v1' };
  const llm = new OpenRouterProvider('test', options);
  const diff = await new MockGitClient().diff();
  diff.files = [diff.files[0]!, { ...diff.files[0]!, path: 'second.ts' }];
  const usage: unknown[] = [];
  const review = reviewPullRequest({
    systemPrompt: 'Review', model: 'test', diff, llm, strategy: 'map-reduce',
    checkCancelled: () => {
      if (cancel && fetch.mock.calls.length > 0) throw new Error('Run cancelled');
    },
    onEvent: ({ data }) => {
      if (data && typeof data === 'object' && 'usage' in data) usage.push(data.usage);
    },
  });
  if (cancel) {
    await expect(review).rejects.toThrow('Run cancelled');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]?.[0]).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(usage).toEqual([{ attempt_id: '1', cost_usd: retry ? null : 0.00412 }]);
    return;
  }
  const outcome = await review;
  const charges = [...(retry ? [null] : []), 0.00412, 0.00612, 0.004];
  expect(usage).toEqual(charges.map((cost_usd, i) => ({ attempt_id: String(i + 1), cost_usd })));
  expect(replies).toHaveLength(0);
  for (const [url] of fetch.mock.calls) {
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
  }
  if (retry) expect(outcome.costUsd).toBeNull();
  else expect(outcome.costUsd).toBeCloseTo(0.01424, 12);
});
