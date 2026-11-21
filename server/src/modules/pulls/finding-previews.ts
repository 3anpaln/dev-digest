import { FindingCategory, FindingPreview, Severity, type FindingSummary } from '@devdigest/shared';
import { and, between, eq, inArray, lte, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { findings } from '../../db/schema.js';

export async function findingSummariesForReviews(db: Db, reviewIds: string[]) {
  const summaries = new Map<string, FindingSummary>();
  if (reviewIds.length === 0) return summaries;

  // Rank only the keys needed for ordering. Fetch preview text after limiting each review.
  const ranked = db.select({
    id: findings.id,
    reviewId: findings.reviewId,
    rank: sql<number>`row_number() over (
      partition by ${findings.reviewId}
      order by case ${findings.severity}
        when 'CRITICAL' then 1 when 'WARNING' then 2 else 3 end,
        ${findings.file}, ${findings.startLine}, ${findings.id}
    )`.as('preview_rank'),
    critical: sql<number>`count(*) filter (where ${findings.severity} = 'CRITICAL')
      over (partition by ${findings.reviewId})`.mapWith(Number).as('critical'),
    warning: sql<number>`count(*) filter (where ${findings.severity} = 'WARNING')
      over (partition by ${findings.reviewId})`.mapWith(Number).as('warning'),
    suggestion: sql<number>`count(*) filter (where ${findings.severity} = 'SUGGESTION')
      over (partition by ${findings.reviewId})`.mapWith(Number).as('suggestion'),
  }).from(findings)
    .where(and(
      inArray(findings.reviewId, reviewIds),
      inArray(findings.severity, Severity.options),
      inArray(findings.category, FindingCategory.options),
      between(findings.confidence, 0, 1),
    ))
    .as('ranked_findings');

  const rows = await db.select({
    reviewId: ranked.reviewId,
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
    .innerJoin(findings, eq(findings.id, ranked.id))
    .where(lte(ranked.rank, 3))
    .orderBy(ranked.reviewId, ranked.rank);

  for (const { reviewId, counts, preview } of rows) {
    const summary = summaries.get(reviewId) ?? { counts, preview: [] };
    summary.preview.push(FindingPreview.parse(preview));
    summaries.set(reviewId, summary);
  }
  return summaries;
}
