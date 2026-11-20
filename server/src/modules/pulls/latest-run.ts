import { and, eq, inArray, sql } from 'drizzle-orm';
import { AttemptUsage, type PrListItem } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import { agentRuns, runTraces } from '../../db/schema.js';

export function loggedCost(log: unknown, runId?: string): number | null {
  if (!Array.isArray(log)) return null;
  const attempts = new Map<string, number>();
  let total = 0;
  for (const line of log) {
    if (!line || typeof line !== 'object' || !('usage' in line)) continue;
    const usage = AttemptUsage.safeParse(line.usage);
    if (!usage.success || usage.data.cost_usd === null) return null;
    const { attempt_id, cost_usd } = usage.data;
    const previous = attempts.get(attempt_id);
    if (previous !== undefined) {
      if (previous !== cost_usd) {
        console.warn('Conflicting costs for a review attempt', {
          runId, attemptId: attempt_id, previousCostUsd: previous, costUsd: cost_usd,
        });
        return null;
      }
      continue;
    }
    attempts.set(attempt_id, cost_usd);
    total += cost_usd;
  }
  return attempts.size && Number.isFinite(total) ? total : null;
}

export async function reviewCostsForPulls(db: Db, workspaceId: string, prIds: string[]) {
  const totals = new Map<string, NonNullable<PrListItem['review_cost']>>();
  if (!prIds.length) return totals;

  // A trace inherits its workspace from its run through the run_id foreign key.
  const rows = await db.select({
    runId: agentRuns.id,
    prId: agentRuns.prId,
    status: agentRuns.status,
    log: sql`${runTraces.trace} -> ${'log'}::text`,
  }).from(agentRuns)
    .leftJoin(runTraces, eq(runTraces.runId, agentRuns.id))
    .where(and(eq(agentRuns.workspaceId, workspaceId), inArray(agentRuns.prId, prIds)));
  for (const { runId, prId, status, log } of rows) {
    if (prId === null) continue;
    const total = totals.get(prId) ?? { running: false, cost_usd: 0 };
    const running = status === 'running';
    const cost = running ? null : loggedCost(log, runId);
    const sum = total.cost_usd === null || cost === null ? null : total.cost_usd + cost;
    total.running ||= running;
    total.cost_usd = sum !== null && Number.isFinite(sum) ? sum : null;
    totals.set(prId, total);
  }
  return totals;
}
