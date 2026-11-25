import { FindingCategory, FindingPreview, Severity, type FindingSummary } from '@devdigest/shared';
import { and, between, desc, eq, inArray, isNotNull, lte, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { agentRuns, findings, reviews } from '../../db/schema.js';

export async function findingSummariesForPulls(
  db: Db, workspaceId: string, prIds: string[], limit: number | 'all' = 3,
) {
  const summaries = new Map<string, FindingSummary>();
  if (prIds.length === 0) return summaries;

  // Pick each agent's latest attempt before checking its status so a rerun
  // with no results cannot bring an older run's findings back into the list.
  const latestRuns = db.$with('latest_agent_runs').as(
    db.selectDistinctOn([agentRuns.prId, agentRuns.agentId], {
      runId: agentRuns.id,
      prId: agentRuns.prId,
      agentId: agentRuns.agentId,
      status: agentRuns.status,
    }).from(agentRuns)
      .where(and(
        eq(agentRuns.workspaceId, workspaceId),
        inArray(agentRuns.prId, prIds),
        isNotNull(agentRuns.agentId),
      ))
      .orderBy(agentRuns.prId, agentRuns.agentId, desc(agentRuns.ranAt), desc(agentRuns.id)),
  );

  // Count across the selected reviews before fetching preview text. The list
  // caps the number of rows per PR, and the open popover can request all rows.
  const ranked = db.select({
    id: findings.id,
    prId: reviews.prId,
    rank: sql<number>`row_number() over (
      partition by ${reviews.prId}
      order by case ${findings.severity}
        when 'CRITICAL' then 1 when 'WARNING' then 2 when 'SUGGESTION' then 3 else 4 end,
        ${findings.file}, ${findings.startLine}, ${findings.id}
    )`.as('preview_rank'),
    critical: sql<number>`count(*) filter (where ${findings.severity} = 'CRITICAL')
      over (partition by ${reviews.prId})`.mapWith(Number).as('critical_count'),
    warning: sql<number>`count(*) filter (where ${findings.severity} = 'WARNING')
      over (partition by ${reviews.prId})`.mapWith(Number).as('warning_count'),
    suggestion: sql<number>`count(*) filter (where ${findings.severity} = 'SUGGESTION')
      over (partition by ${reviews.prId})`.mapWith(Number).as('suggestion_count'),
  }).from(latestRuns)
    .innerJoin(reviews, and(
      eq(reviews.runId, latestRuns.runId),
      eq(reviews.prId, latestRuns.prId),
      eq(reviews.workspaceId, workspaceId),
      eq(reviews.agentId, latestRuns.agentId),
      eq(reviews.kind, 'review'),
    ))
    .leftJoin(findings, and(
      eq(findings.reviewId, reviews.id),
      inArray(findings.severity, Severity.options),
      inArray(findings.category, FindingCategory.options),
      between(findings.confidence, 0, 1),
    ))
    .where(eq(latestRuns.status, 'done'))
    .as('ranked_findings');

  const rows = await db.with(latestRuns).select({
    prId: ranked.prId,
    counts: { critical: ranked.critical, warning: ranked.warning, suggestion: ranked.suggestion },
    preview: {
      id: findings.id,
      severity: findings.severity,
      title: findings.title,
      category: findings.category,
      file: findings.file,
      start_line: findings.startLine,
      end_line: findings.endLine,
      confidence: findings.confidence,
      rationale: sql<string>`left(${findings.rationale}, 280)`,
    },
  }).from(ranked)
    .leftJoin(findings, eq(findings.id, ranked.id))
    .where(limit === 'all' ? undefined : lte(ranked.rank, limit))
    .orderBy(ranked.prId, ranked.rank);

  for (const { prId, counts, preview } of rows) {
    const summary = summaries.get(prId) ?? { counts, preview: [] };
    if (preview?.id) summary.preview.push(FindingPreview.parse(preview));
    summaries.set(prId, summary);
  }
  return summaries;
}
