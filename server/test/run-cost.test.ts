import { describe, expect, it, vi } from 'vitest';
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

  it('distinguishes known zero from absent, incomplete or malformed usage', () => {
    expect(loggedCost([usage('1', 0), usage('1', 0)])).toBe(0);
    for (const log of [null, [], [{ msg: 'legacy' }], [usage('1', 0), usage('2', null)],
      [{ usage: { cost_usd: 2 } }]]) {
      expect(loggedCost(log)).toBeNull();
    }
  });

  it.each(['', 42, null, { id: '2' }])('rejects malformed attempt ID %j', (attempt_id) => {
    expect(loggedCost([usage('1', 0.01), { usage: { attempt_id, cost_usd: 0.02 } }])).toBeNull();
  });

  it('warns about conflicting charges for one attempt and returns unknown', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      expect(loggedCost([usage('1', 0), usage('1', 0)], 'run-1')).toBe(0);
      expect(warn).not.toHaveBeenCalled();
      expect(loggedCost([usage('1', 0), usage('1', 1)], 'run-1')).toBeNull();
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledWith('Conflicting costs for a review attempt', {
        runId: 'run-1', attemptId: '1', previousCostUsd: 0, costUsd: 1,
      });
    } finally {
      warn.mockRestore();
    }
  });
});
