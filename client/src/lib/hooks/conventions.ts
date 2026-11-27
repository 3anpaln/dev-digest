"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ConventionCandidate, ConventionScan, ConventionSkillDraft, ConventionsPage, EditableSkill } from "@devdigest/shared";
import { api } from "../api";
import { skillLibraryKey } from "./skills";

const pathFor = (repoId: string) => `/repos/${repoId}/conventions`;
const keyFor = (repoId: string, branch: string) => ["conventions", repoId, branch] as const;
const branchQuery = (branch: string) => "?" + new URLSearchParams({ branch });

export function useConventions(repoId: string, branch: string) {
  return useQuery({
    queryKey: keyFor(repoId, branch),
    queryFn: () => api.get<ConventionsPage>(pathFor(repoId) + branchQuery(branch)),
    enabled: Boolean(branch),
    refetchInterval: ({ state: { data } }) => {
      if (data?.active_branch || data?.latest?.status === "running" || data?.latest?.status === "queued") return 2000;
      return data && data.readiness !== "ready" ? 5000 : false;
    },
  });
}

export function useConventionScan(repoId: string) {
  const cache = useQueryClient();
  return useMutation({
    mutationFn: (selection: { branch: string; fileLimit: number; directory: string; maxResponseTokens: number }) =>
      api.post<ConventionScan>(pathFor(repoId) + "/scan", selection),
    onSuccess: (latest, { branch }) => {
      cache.setQueryData<ConventionsPage>(keyFor(repoId, branch), (page) => page && {
        ...page, active_branch: latest.branch, latest: latest.branch === branch ? latest : page.latest,
      });
      void cache.invalidateQueries({ queryKey: ["conventions", repoId] });
    },
  });
}

export function useSyncConventionBranch(repoId: string) {
  return useMutation({
    mutationFn: (branch: string) => api.post<{ branch: string }>(pathFor(repoId) + "/branch/sync", { branch }),
  });
}

export function useEditConvention(repoId: string, branch: string, candidateId: string) {
  const cache = useQueryClient();
  return useMutation({
    mutationFn: (edit: { revision: string } & Partial<Pick<ConventionCandidate, "rule" | "scope" | "decision">>) =>
      api.patch<ConventionCandidate>(pathFor(repoId) + "/findings/" + candidateId + branchQuery(branch), edit),
    onSuccess: (saved) => {
      cache.setQueryData<ConventionsPage>(keyFor(repoId, branch), (page) => page && {
        ...page, findings: page.findings.map((candidate) => candidate.id === saved.id ? saved : candidate),
      });
    },
    onSettled: () => { void cache.invalidateQueries({ queryKey: keyFor(repoId, branch) }); },
  });
}

export function useClearConventionDecisions(repoId: string, branch: string) {
  const cache = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<ConventionsPage>(pathFor(repoId) + "/decisions/clear" + branchQuery(branch)),
    onSuccess: (page) => { cache.setQueryData(keyFor(repoId, branch), page); },
    onSettled: () => { void cache.invalidateQueries({ queryKey: keyFor(repoId, branch) }); },
  });
}

export function loadConventionDraft(repoId: string, branch: string) {
  return api.get<ConventionSkillDraft>(pathFor(repoId) + "/skill-draft" + branchQuery(branch));
}

export function useSaveConventionSkill(repoId: string, branch: string) {
  const cache = useQueryClient();
  return useMutation({
    mutationFn: (input: Pick<ConventionSkillDraft, "revision" | "name" | "description" | "body"> & { requestId: string }) =>
      api.post<EditableSkill>(pathFor(repoId) + "/skills" + branchQuery(branch), input),
    onSuccess: () => { void cache.invalidateQueries({ queryKey: skillLibraryKey }); },
  });
}
