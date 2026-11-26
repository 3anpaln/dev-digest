import { createHash } from 'node:crypto';
import { and, asc, count, desc, eq, or, sql } from 'drizzle-orm';
import type { EditableSkill, SkillStats, SkillVersion } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import { agents, agentRuns, agentSkills, findings, reviews, runTraces, skills, skillVersions, workspaces } from '../../db/schema.js';
import { AppError, NotFoundError } from '../../platform/errors.js';

type SkillRow = typeof skills.$inferSelect;
type SkillInput = Pick<SkillRow, 'name' | 'description' | 'type' | 'body' | 'enabled'>;
const LIBRARY_OWNER_ID = '7bf44079-ec76-41ea-b58a-5dbde0eb210e';

async function ensureLibraryOwner(db: Pick<Db, 'insert'>): Promise<void> {
  await db.insert(workspaces).values({ id: LIBRARY_OWNER_ID, name: 'Shared Skills Library' })
    .onConflictDoNothing({ target: workspaces.id });
}

// New skills are shared. Existing private skills stay visible to their owners.
export function visibleSkills(workspaceId: string) {
  return or(eq(skills.workspaceId, LIBRARY_OWNER_ID), eq(skills.workspaceId, workspaceId));
}

function revisionOf({ id, name, description, type, body, enabled, version }: SkillRow): string {
  return createHash('sha256').update(JSON.stringify([id, name, description, type, body, enabled, version])).digest('hex');
}

function toSkill(row: SkillRow): EditableSkill {
  const { id, name, description, type, source, body, enabled, version } = row;
  return { id, name, description, type, source, body, enabled, version, revision: revisionOf(row), evidence_files: row.evidenceFiles };
}

export class SkillsRepository {
  constructor(private readonly db: Db) {}

  async list(workspaceId: string): Promise<EditableSkill[]> {
    const rows = await this.db.select().from(skills).where(visibleSkills(workspaceId))
      .orderBy(asc(skills.name), asc(skills.id));
    return rows.map(toSkill);
  }

  async create(input: SkillInput): Promise<EditableSkill> {
    return this.db.transaction(async (tx) => {
      await ensureLibraryOwner(tx);
      const [row] = await tx.insert(skills).values({ ...input, workspaceId: LIBRARY_OWNER_ID, source: 'manual' }).returning();
      await tx.insert(skillVersions).values({ skillId: row!.id, version: 1, body: row!.body });
      return toSkill(row!);
    });
  }

  async seedPresets(presets: ReadonlyArray<Omit<SkillInput, 'enabled'> & { id: string }>): Promise<number> {
    return this.db.transaction(async (tx) => {
      await ensureLibraryOwner(tx);
      const existing = await tx.select({ name: skills.name }).from(skills)
        .where(eq(skills.workspaceId, LIBRARY_OWNER_ID));
      const names = new Set(existing.map(({ name }) => name.trim().toLowerCase()));
      const missing = presets.filter(({ name }) => !names.has(name.toLowerCase()));
      if (missing.length === 0) return 0;
      const inserted = await tx.insert(skills)
        .values(missing.map((preset) => ({ ...preset, workspaceId: LIBRARY_OWNER_ID, source: 'manual' as const })))
        .onConflictDoNothing({ target: skills.id })
        .returning({ skillId: skills.id, body: skills.body });
      if (inserted.length > 0) {
        await tx.insert(skillVersions).values(inserted.map((skill) => ({ ...skill, version: 1 })));
      }
      return inserted.length;
    });
  }

  async update(
    workspaceId: string,
    id: string,
    revision: string,
    change: Partial<SkillInput> | { restore: number },
  ): Promise<EditableSkill> {
    return this.db.transaction(async (tx) => {
      const [current] = await tx.select().from(skills)
        .where(and(eq(skills.id, id), visibleSkills(workspaceId))).for('update');
      if (!current) throw new NotFoundError('Skill not found');
      if (revision !== revisionOf(current)) {
        throw new AppError('stale_skill', 'This skill changed. Review the latest version before saving again.', 409);
      }

      let patch: Partial<SkillInput>;
      let version = current.version;
      if ('restore' in change) {
        const [saved] = await tx.select({ body: skillVersions.body }).from(skillVersions)
          .where(and(eq(skillVersions.skillId, id), eq(skillVersions.version, change.restore)));
        if (!saved) throw new NotFoundError('Skill version not found');
        patch = { body: saved.body };
        version++;
      } else {
        patch = change;
        if (patch.body !== undefined && patch.body !== current.body) version++;
      }

      if (version !== current.version) {
        // Older records can predate version-history writes.
        await tx.insert(skillVersions).values({
          skillId: id, version: current.version, body: current.body, createdAt: current.createdAt,
        }).onConflictDoNothing();
        await tx.insert(skillVersions).values({ skillId: id, version, body: patch.body! });
      }
      const [updated] = await tx.update(skills)
        .set({ ...patch, version })
        .where(eq(skills.id, id)).returning();
      return toSkill(updated!);
    });
  }

  private async requireSkill(workspaceId: string, id: string): Promise<SkillRow> {
    const [row] = await this.db.select().from(skills)
      .where(and(eq(skills.id, id), visibleSkills(workspaceId)));
    if (!row) throw new NotFoundError('Skill not found');
    return row;
  }

  async versions(workspaceId: string, id: string): Promise<SkillVersion[]> {
    const current = await this.requireSkill(workspaceId, id);
    const rows = await this.db.select().from(skillVersions)
      .where(eq(skillVersions.skillId, id)).orderBy(desc(skillVersions.version));
    const history = rows.map((row) => ({ version: row.version, body: row.body, created_at: row.createdAt.toISOString() }));
    if (!history.some((version) => version.version === current.version)) {
      history.unshift({ version: current.version, body: current.body, created_at: current.createdAt.toISOString() });
    }
    return history;
  }

  async stats(workspaceId: string, id: string): Promise<SkillStats> {
    await this.requireSkill(workspaceId, id);
    const windowStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const scopedRuns = and(
      eq(agentRuns.workspaceId, workspaceId),
      eq(agentRuns.source, 'local'),
      sql`${runTraces.trace}->>'first_dispatch_at' >= ${windowStart}`,
      sql`(${runTraces.trace}->'skill_snapshot') @> ${JSON.stringify([{ id }])}::jsonb`,
    );
    const [assigned, [usage], categories] = await Promise.all([
      this.db.select({ id: agents.id, name: agents.name, enabled: agents.enabled }).from(agentSkills)
        .innerJoin(agents, eq(agents.id, agentSkills.agentId))
        .where(and(eq(agentSkills.skillId, id), eq(agents.workspaceId, workspaceId))).orderBy(asc(agents.name)),
      this.db.select({ runs: count() }).from(agentRuns)
        .innerJoin(runTraces, eq(runTraces.runId, agentRuns.id)).where(scopedRuns),
      this.db.select({
        name: findings.category,
        count: count(),
        accepted: sql<number>`count(*) filter (where ${findings.acceptedAt} is not null)`.mapWith(Number),
        dismissed: sql<number>`count(*) filter (where ${findings.dismissedAt} is not null)`.mapWith(Number),
      }).from(agentRuns)
        .innerJoin(runTraces, eq(runTraces.runId, agentRuns.id))
        .innerJoin(reviews, and(eq(reviews.runId, agentRuns.id), eq(reviews.workspaceId, workspaceId)))
        .innerJoin(findings, eq(findings.reviewId, reviews.id))
        .where(and(scopedRuns, eq(agentRuns.status, 'done')))
        .groupBy(findings.category).orderBy(asc(findings.category)),
    ]);
    return {
      agents: assigned,
      runs: usage?.runs ?? 0,
      findings: categories.reduce((sum, row) => sum + row.count, 0),
      accepted: categories.reduce((sum, row) => sum + row.accepted, 0),
      dismissed: categories.reduce((sum, row) => sum + row.dismissed, 0),
      categories: categories.map(({ name, count }) => ({ name, count })),
    };
  }
}
