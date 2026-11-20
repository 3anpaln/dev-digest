import { createServer } from 'node:http';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { expect, it, vi } from 'vitest';
import { AttemptCosts, OpenRouterProvider, reviewPullRequest } from '../src/index.js';
import { MockGitClient } from '../../server/src/adapters/mocks.js';

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

it.each([false, true])('logs each map and repair attempt once (transport retry %s)', async (retry) => {
  const valid = JSON.stringify({ verdict: 'approve', summary: 'OK', score: 100, findings: [] });
  const replies = [
    ...(retry ? [{ status: 503 }] : []),
    { status: 200, raw: '{}', cost: 0.00412 },
    { status: 200, raw: valid, cost: 0.00612 },
    { status: 200, raw: valid, cost: 0.004 },
  ];
  const server = createServer((_req, res) => {
    const reply = replies.shift();
    res.writeHead(reply?.status ?? 400, { 'content-type': 'application/json', 'retry-after-ms': '1' });
    res.end(JSON.stringify(reply && 'raw' in reply ? {
      choices: [{ message: { content: reply.raw } }], usage: { cost: reply.cost },
    } : { error: { message: 'Unavailable' } }));
  });
  server.listen(0, '127.0.0.1');
  try {
    await once(server, 'listening');
    const llm = new OpenRouterProvider('test', {
      baseURL: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, maxRetries: 1,
    });
    const diff = await new MockGitClient().diff();
    diff.files = [diff.files[0]!, { ...diff.files[0]!, path: 'second.ts' }];
    const usage: unknown[] = [];
    const outcome = await reviewPullRequest({
      systemPrompt: 'Review', model: 'test', diff, llm, strategy: 'map-reduce',
      onEvent: ({ data }) => {
        if (data && typeof data === 'object' && 'usage' in data) usage.push(data.usage);
      },
    });
    const charges = [...(retry ? [null] : []), 0.00412, 0.00612, 0.004];
    expect(usage).toEqual(charges.map((cost_usd, i) => ({ attempt_id: String(i + 1), cost_usd })));
    expect(replies).toHaveLength(0);
    if (retry) expect(outcome.costUsd).toBeNull();
    else expect(outcome.costUsd).toBeCloseTo(0.01424, 12);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
