"use client";

import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Agent, AgentSkillLink, EditableSkill, SkillLibraryItem, SkillStats, SkillVersion } from "@devdigest/shared";
import { api } from "../api";

export type SkillFields = Pick<EditableSkill, "name" | "description" | "type" | "body" | "enabled">;
export const skillLibraryKey = ["skills"] as const;
type LibraryEntry = Omit<SkillLibraryItem, "assigned_agents_count"> & { assigned_agents_count: number | null };
type SkillListResponse = EditableSkill & { assigned_agents_count?: number };

async function loadSkillLibrary(): Promise<LibraryEntry[]> {
  const skills = await api.get<SkillListResponse[]>("/skills");
  if (skills.every((skill) => skill.assigned_agents_count !== undefined)) {
    return skills.map((skill) => ({ ...skill, assigned_agents_count: skill.assigned_agents_count ?? null }));
  }

  // Older API processes expose assignments separately.
  const counts = new Map<string, number>();
  let countsAvailable = false;
  try {
    const agents = await api.get<Agent[]>("/agents");
    const assignments = await Promise.all(agents.map(({ id }) => api.get<AgentSkillLink[]>(`/agents/${id}/skills`)));
    for (const links of assignments) {
      for (const { skill_id } of links) counts.set(skill_id, (counts.get(skill_id) ?? 0) + 1);
    }
    countsAvailable = true;
  } catch {
    // Keep the library usable when the assignment endpoints are unavailable.
  }
  return skills.map((skill) => ({
    ...skill,
    assigned_agents_count: skill.assigned_agents_count ?? (countsAvailable ? counts.get(skill.id) ?? 0 : null),
  }));
}

export function useSkills() {
  return useQuery({ queryKey: skillLibraryKey, queryFn: loadSkillLibrary });
}

export function useSkillVersions(id: string) {
  return useQuery({
    queryKey: ["skill-versions", id],
    queryFn: () => api.get<SkillVersion[]>(`/skills/${id}/versions`),
  });
}

export function useSkillStats(id: string) {
  return useQuery({
    queryKey: ["skill-stats", id],
    queryFn: () => api.get<SkillStats>(`/skills/${id}/stats`),
  });
}

export function useSaveSkill() {
  const cache = useQueryClient();
  return useMutation({
    mutationFn: (input: { fields: SkillFields; current?: EditableSkill }) => {
      const { fields, current } = input;
      return current
        ? api.put<EditableSkill>(`/skills/${current.id}`, { ...fields, revision: current.revision })
        : api.post<EditableSkill>("/skills", fields);
    },
    onSuccess: (skill, { current }) => {
      cache.setQueryData<LibraryEntry[]>(skillLibraryKey, (list = []) => [
        ...list.filter((item) => item.id !== skill.id),
        { ...skill, assigned_agents_count: list.find((item) => item.id === skill.id)?.assigned_agents_count ?? (current ? null : 0) },
      ].sort((left, right) => left.name.localeCompare(right.name)));
      void cache.invalidateQueries({ queryKey: ["skill-versions", skill.id] });
    },
  });
}

export function useRestoreSkill() {
  const cache = useQueryClient();
  return useMutation({
    mutationFn: ({ skill, version }: { skill: EditableSkill; version: number }) =>
      api.post<EditableSkill>(`/skills/${skill.id}/restore`, { revision: skill.revision, version }),
    onSuccess: (skill) => {
      cache.setQueryData<LibraryEntry[]>(skillLibraryKey, (list) =>
        list?.map((item) => item.id === skill.id ? { ...item, ...skill } : item),
      );
      void cache.invalidateQueries({ queryKey: ["skill-versions", skill.id] });
    },
  });
}

export function useSkillCardAction() {
  const cache = useQueryClient();
  return useMutation({
    mutationFn: async ({ skill, enabled }: { skill: EditableSkill; enabled?: boolean }) => {
      const path = `/skills/${skill.id}`;
      if (enabled === undefined) {
        await api.del<void>(`${path}?revision=${skill.revision}`);
        return null;
      }
      return api.put<EditableSkill>(path, { revision: skill.revision, enabled });
    },
    onSuccess: (updated, { skill }) => {
      cache.setQueryData<LibraryEntry[]>(skillLibraryKey, (list) =>
        list?.flatMap((item) => item.id === skill.id ? (updated ? [{ ...item, ...updated }] : []) : [item]),
      );
      void cache.invalidateQueries({ queryKey: skillLibraryKey });
      if (!updated) {
        void cache.invalidateQueries({ queryKey: ["agent-skills"] });
      }
    },
    onError: () => { void cache.invalidateQueries({ queryKey: skillLibraryKey }); },
  });
}

function agentSkillsQuery(agentId: string) {
  return {
    queryKey: ["agent-skills", agentId] as const,
    queryFn: () => api.get<AgentSkillLink[]>(`/agents/${agentId}/skills`),
  };
}

export function useAgentSkills(agentId: string) {
  return useQuery(agentSkillsQuery(agentId));
}

export function useAgentSkillCounts(agents: readonly Pick<Agent, "id">[]) {
  const results = useQueries({ queries: agents.map(({ id }) => agentSkillsQuery(id)) });
  return new Map(agents.map(({ id }, index) => [id, results[index]?.data?.length]));
}

export function useSaveAgentSkills(agentId: string) {
  const cache = useQueryClient();
  return useMutation({
    mutationFn: (skillIds: string[]) => api.post<AgentSkillLink[]>(`/agents/${agentId}/skills`, { skill_ids: skillIds }),
    onSuccess: (links) => {
      cache.setQueryData(agentSkillsQuery(agentId).queryKey, links);
      void cache.invalidateQueries({ queryKey: ["agent", agentId] });
      void cache.invalidateQueries({ queryKey: ["skill-stats"] });
      void cache.invalidateQueries({ queryKey: skillLibraryKey });
    },
  });
}
