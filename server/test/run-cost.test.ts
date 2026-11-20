import { describe, expect, it } from 'vitest';
import { loggedCost } from '../src/modules/pulls/latest-run.js';

const usage = (attempt_id: string, cost_usd: number | null) => ({ usage: { attempt_id, cost_usd } });

describe('saved attempt usage', () => {
  it('sums two chunks and a repair, ignoring replays and unrelated lines', () => {
    const repair = usage('2', 0.00612);
    expect(loggedCost([
      usage('1', 0.00412), repair, usage('3', 0.004), repair,
      { msg: 'USD 0.01424' }, { cost_usd: 0.01424 },
    ])).toBeCloseTo(0.01424, 12);
  });

  it('distinguishes known zero from absent, incomplete, malformed or conflicting usage', () => {
    expect(loggedCost([usage('1', 0), usage('1', 0)])).toBe(0);
    for (const log of [null, [], [{ msg: 'legacy' }], [usage('1', 0), usage('2', null)],
      [usage('1', 0), usage('1', 1)], [{ usage: { cost_usd: 2 } }]]) {
      expect(loggedCost(log)).toBeNull();
    }
  });
});
