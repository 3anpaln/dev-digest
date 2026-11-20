import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { AttemptUsage, type PrListItem } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import { agentRuns, runTraces } from '../../db/schema.js';

export function loggedCost(log: unknown): number | null {
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
      if (previous !== cost_usd) return null;
      continue;
    }
    attempts.set(attempt_id, cost_usd);
    total += cost_usd;
  }
  return attempts.size && Number.isFinite(total) ? total : null;
}

export async function latestRunsForPulls(db: Db, workspaceId: string, prIds: string[]) {
  const runs = new Map<string, NonNullable<PrListItem['latest_run']>>();
  if (!prIds.length) return runs;

  const latest = db.selectDistinctOn([agentRuns.prId], {
    id: agentRuns.id, prId: agentRuns.prId, status: agentRuns.status,
  }).from(agentRuns)
    .where(and(eq(agentRuns.workspaceId, workspaceId), inArray(agentRuns.prId, prIds)))
    .orderBy(agentRuns.prId, desc(agentRuns.ranAt), desc(agentRuns.id))
    .as('latest');
  // Keep the workspace filter in the run selection above. A trace has no
  // separate workspace: its primary key is a foreign key to the globally
  // unique agent_runs.id, so it belongs to exactly that run's workspace.
  const rows = await db.select({
    prId: latest.prId, status: latest.status, log: sql`${runTraces.trace} -> 'log'`,
  }).from(latest).leftJoin(runTraces, eq(runTraces.runId, latest.id));
  for (const { prId, status, log } of rows) {
    runs.set(prId!, { status, cost_usd: status === 'running' ? null : loggedCost(log) });
  }
  return runs;
}
