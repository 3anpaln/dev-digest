import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { api } from "../../../../../../lib/api";
import { SkillsTab } from "./SkillsTab";

afterEach(() => vi.restoreAllMocks());

it("groups available skills while keeping one reorderable list for assigned skills", async () => {
  vi.spyOn(api, "get").mockImplementation(async (path) => {
    if (path === "/agents/agent/skills") {
      return [{ skill_id: "security" }, { skill_id: "rubric" }] as never;
    }
    return [
      { id: "rubric", name: "Review basics", type: "rubric", enabled: true, assigned_agents_count: 1 },
      { id: "security", name: "Workspace access", type: "security", enabled: true, assigned_agents_count: 1 },
      { id: "convention", name: "Route naming", type: "convention", enabled: true, assigned_agents_count: 0 },
      { id: "custom", name: "Team checklist", type: "custom", enabled: true, assigned_agents_count: 0 },
    ] as never;
  });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <SkillsTab agentId="agent" />
    </QueryClientProvider>,
  );
  const ordered = await screen.findByRole("list", { name: "Agent skills" });
  const names = () => within(ordered).getAllByRole("switch").map((toggle) => toggle.getAttribute("aria-label"));
  expect(names()).toEqual(["Workspace access", "Review basics"]);
  expect(within(screen.getByRole("list", { name: "Available convention skills" })).getByText("Route naming")).toBeVisible();
  expect(within(screen.getByRole("list", { name: "Available custom skills" })).getByText("Team checklist")).toBeVisible();

  fireEvent.click(within(ordered).getByRole("button", { name: "Move Review basics up" }));
  expect(names()).toEqual(["Review basics", "Workspace access"]);

  fireEvent.click(screen.getByRole("switch", { name: "Route naming", checked: false }));
  expect(within(ordered).getByRole("switch", { name: "Route naming", checked: true })).toBeVisible();
  expect(names()).toEqual(["Review basics", "Workspace access", "Route naming"]);
});
