import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { api } from "../api";
import { useSkills } from "./skills";

afterEach(() => vi.restoreAllMocks());

function renderSkills() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderHook(useSkills, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
}

it("counts assignments when the Skills response omits counts", async () => {
  vi.spyOn(api, "get")
    .mockResolvedValueOnce([{ id: "assigned" }, { id: "unassigned" }])
    .mockResolvedValueOnce([{ id: "reviewer" }])
    .mockResolvedValueOnce([{ skill_id: "assigned" }]);
  const { result } = renderSkills();

  await waitFor(() => expect(result.current.data).toEqual([
    { id: "assigned", assigned_agents_count: 1 },
    { id: "unassigned", assigned_agents_count: 0 },
  ]));
  expect(api.get).toHaveBeenCalledWith("/agents/reviewer/skills");
});

it("leaves an unavailable assignment count unknown and preserves confirmed zero counts", async () => {
  vi.spyOn(api, "get")
    .mockResolvedValueOnce([{ id: "unknown" }, { id: "unassigned", assigned_agents_count: 0 }])
    .mockRejectedValueOnce(new Error("Agent list unavailable"));
  const { result } = renderSkills();

  await waitFor(() => expect(result.current.data).toEqual([
    { id: "unknown", assigned_agents_count: null },
    { id: "unassigned", assigned_agents_count: 0 },
  ]));
});
