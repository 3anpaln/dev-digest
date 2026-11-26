"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AgentSkillLink, EditableSkill, SkillStats, SkillVersion } from "@devdigest/shared";
import { api } from "../api";

export type SkillFields = Pick<EditableSkill, "name" | "description" | "type" | "body" | "enabled">;
const libraryKey = ["skills"] as const;

export function useSkills() {
  return useQuery({ queryKey: libraryKey, queryFn: () => api.get<EditableSkill[]>("/skills") });
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
    onSuccess: (skill) => {
      cache.setQueryData<EditableSkill[]>(libraryKey, (list = []) => [
        ...list.filter((item) => item.id !== skill.id),
        skill,
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
      cache.setQueryData<EditableSkill[]>(libraryKey, (list) =>
        list?.map((item) => item.id === skill.id ? skill : item),
      );
      void cache.invalidateQueries({ queryKey: ["skill-versions", skill.id] });
    },
  });
}

export function useAgentSkills(agentId: string) {
  return useQuery({
    queryKey: ["agent-skills", agentId],
    queryFn: () => api.get<AgentSkillLink[]>(`/agents/${agentId}/skills`),
  });
}

export function useSaveAgentSkills(agentId: string) {
  const cache = useQueryClient();
  return useMutation({
    mutationFn: (skillIds: string[]) => api.post<AgentSkillLink[]>(`/agents/${agentId}/skills`, { skill_ids: skillIds }),
    onSuccess: (links) => {
      cache.setQueryData(["agent-skills", agentId], links);
      void cache.invalidateQueries({ queryKey: ["agent", agentId] });
      void cache.invalidateQueries({ queryKey: ["skill-stats"] });
    },
  });
}
