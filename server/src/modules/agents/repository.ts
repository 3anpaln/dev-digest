import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { CiFailOn, Provider, ReviewStrategy } from '@devdigest/shared';
import { DEFAULT_AGENT_DESCRIPTION, INITIAL_AGENT_VERSION } from './constants.js';
import type { AgentUpdateStore } from './application/update-agent.js';
import { visibleSkills } from '../skills/repository.js';
import { ValidationError } from '../../platform/errors.js';

/**
 * A2 — agents data-access. Owns `agents`, `agent_versions`, and the
 * `agent_skills` link table (shared with A1's skills repository, but A2 owns the
 * agent side: link/reorder/list for an agent). Workspace-scoped throughout.
 */

import type { AgentRow, AgentVersionRow } from '../../db/rows.js';
export type { AgentRow, AgentVersionRow };

export interface InsertAgent {
  workspaceId: string;
  name: string;
  description?: string;
  provider: Provider;
  model: string;
  systemPrompt: string;
  outputSchema?: unknown;
  strategy?: ReviewStrategy;
  ciFailOn?: CiFailOn;
  repoIntel?: boolean;
  enabled?: boolean;
  createdBy?: string | null;
}

/** A skill linked to an agent (with its order), joined from agent_skills. */
export interface LinkedSkillRow {
  skill: typeof t.skills.$inferSelect;
  order: number;
}

export class AgentsRepository implements AgentUpdateStore {
  constructor(private db: Db) {}

  async list(workspaceId: string): Promise<AgentRow[]> {
    return this.db.select().from(t.agents).where(eq(t.agents.workspaceId, workspaceId));
  }

  async listEnabled(workspaceId: string): Promise<AgentRow[]> {
    return this.db
      .select()
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.enabled, true)));
  }

  async getById(workspaceId: string, id: string): Promise<AgentRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.id, id)));
    return row;
  }

  /** Delete an agent (scoped to workspace). Versions/skill-links cascade;
   *  agent_runs keep their history with agent_id set null. Returns false if
   *  no such agent existed in the workspace. */
  async deleteById(workspaceId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.id, id)))
      .returning({ id: t.agents.id });
    return rows.length > 0;
  }

  /** Insert the agent and its initial configuration snapshot together. */
  async insert(values: InsertAgent): Promise<AgentRow> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(t.agents)
        .values({
          workspaceId: values.workspaceId,
          name: values.name,
          description: values.description ?? DEFAULT_AGENT_DESCRIPTION,
          provider: values.provider,
          model: values.model,
          systemPrompt: values.systemPrompt,
          outputSchema: values.outputSchema ?? null,
          ...(values.strategy !== undefined ? { strategy: values.strategy } : {}),
          ...(values.ciFailOn !== undefined ? { ciFailOn: values.ciFailOn } : {}),
          ...(values.repoIntel !== undefined ? { repoIntel: values.repoIntel } : {}),
          enabled: values.enabled ?? true,
          version: INITIAL_AGENT_VERSION,
          createdBy: values.createdBy ?? null,
        })
        .returning();
      await this.snapshotVersion(tx, row!);
      return row!;
    });
  }

  async update(
    workspaceId: string,
    id: string,
    plan: Parameters<AgentUpdateStore['update']>[2],
  ): Promise<AgentRow | undefined> {
    return this.db.transaction(async (tx) => {
      const scope = and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.id, id));
      const [current] = await tx.select().from(t.agents).where(scope).for('update');
      if (!current) return undefined;

      const { patch, version } = plan(current);
      const [row] = await tx
        .update(t.agents)
        .set({ ...patch, version })
        .where(scope)
        .returning();
      if (row && version !== current.version) await this.snapshotVersion(tx, row);
      return row;
    });
  }

  private async snapshotVersion(db: Pick<Db, 'select' | 'insert'>, row: AgentRow): Promise<void> {
    const links = await db
      .select({ id: t.agentSkills.skillId })
      .from(t.agentSkills)
      .where(eq(t.agentSkills.agentId, row.id))
      .orderBy(asc(t.agentSkills.order));

    await db.insert(t.agentVersions).values({
      agentId: row.id,
      version: row.version,
      configJson: {
        provider: row.provider,
        model: row.model,
        system_prompt: row.systemPrompt,
        output_schema: row.outputSchema,
        strategy: row.strategy,
        ci_fail_on: row.ciFailOn,
        repo_intel: row.repoIntel,
        skills: links.map((link) => link.id),
      },
    });
  }

  // ---- agent_versions (immutable config snapshots) ------------------------

  /** All config snapshots for an agent, newest version first. */
  async listVersions(agentId: string): Promise<AgentVersionRow[]> {
    return this.db
      .select()
      .from(t.agentVersions)
      .where(eq(t.agentVersions.agentId, agentId))
      .orderBy(desc(t.agentVersions.version));
  }

  /** A single config snapshot, or undefined if that version was never recorded. */
  async getVersion(agentId: string, version: number): Promise<AgentVersionRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.agentVersions)
      .where(and(eq(t.agentVersions.agentId, agentId), eq(t.agentVersions.version, version)));
    return row;
  }

  // ---- agent_skills link table (A2 owns the agent side) -------------------

  /** Skills linked to an agent, in `order` ascending. */
  async linkedSkills(workspaceId: string, agentId: string, db: Pick<Db, 'select'> = this.db): Promise<LinkedSkillRow[]> {
    return db
      .select({ skill: t.skills, order: t.agentSkills.order })
      .from(t.agentSkills)
      .innerJoin(t.skills, eq(t.agentSkills.skillId, t.skills.id))
      .innerJoin(t.agents, eq(t.agents.id, t.agentSkills.agentId))
      .where(and(eq(t.agentSkills.agentId, agentId), eq(t.agents.workspaceId, workspaceId), visibleSkills(workspaceId)))
      .orderBy(asc(t.agentSkills.order), asc(t.agentSkills.skillId));
  }

  async updateSkills(
    workspaceId: string,
    agentId: string,
    change: string[] | { skillId: string; order?: number },
  ): Promise<LinkedSkillRow[] | undefined> {
    return this.db.transaction(async (tx) => {
      const [agent] = await tx.select().from(t.agents)
        .where(and(eq(t.agents.id, agentId), eq(t.agents.workspaceId, workspaceId))).for('update');
      if (!agent) return undefined;

      const current = await this.linkedSkills(workspaceId, agentId, tx);
      const ids = Array.isArray(change) ? change : current.map(({ skill }) => skill.id);
      if (!Array.isArray(change)) {
        const previous = ids.indexOf(change.skillId);
        if (previous >= 0) ids.splice(previous, 1);
        ids.splice(Math.max(0, change.order ?? (previous >= 0 ? previous : ids.length)), 0, change.skillId);
      }
      if (new Set(ids).size !== ids.length) throw new ValidationError('Each skill can be assigned only once');
      if (ids.length === current.length && current.every(({ skill }, index) => skill.id === ids[index])) return current;

      if (ids.length > 0) {
        const visible = await tx.select({ id: t.skills.id }).from(t.skills)
          .where(and(inArray(t.skills.id, ids), visibleSkills(workspaceId)));
        if (visible.length !== ids.length) throw new ValidationError('One or more skills are unavailable');
      }
      await tx.delete(t.agentSkills).where(eq(t.agentSkills.agentId, agentId));
      if (ids.length > 0) {
        await tx.insert(t.agentSkills).values(ids.map((skillId, order) => ({ agentId, skillId, order })));
      }
      const version = agent.version + 1;
      await tx.update(t.agents).set({ version }).where(eq(t.agents.id, agentId));
      await this.snapshotVersion(tx, { ...agent, version });
      return this.linkedSkills(workspaceId, agentId, tx);
    });
  }
}
