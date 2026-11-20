import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import messages from "../../../../../../../messages/en/prReview.json";
import { PrListItem } from "@devdigest/shared";
import PullsPage from "../../page";

const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
  useParams: () => ({ repoId: "acme" }),
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams("status=all"),
}));
vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ activeRepo: { full_name: "acme/demo" } }),
  useRepoNotFound: () => false,
}));
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => children,
}));

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("renders the latest amounts in the cost column and preserves PR row navigation on refetch", async () => {
  const cases = [
    { run: { status: "done", cost_usd: 0.01424 }, value: "$0.014", label: "Latest review cost · $0.014" },
    { run: { status: "done", cost_usd: 0 }, value: "$0.000", label: "Latest review cost · $0.000" },
    { run: { status: "done", cost_usd: 0.0001 }, value: "<$0.001", label: "Latest review cost · <$0.001" },
    { run: { status: "done", cost_usd: 0.0145 }, value: "$0.015", label: "Latest review cost · $0.015" },
    { run: { status: "done", cost_usd: 0.0005 }, value: "$0.001", label: "Latest review cost · $0.001" },
    { run: { status: "done", cost_usd: null }, value: "—", label: "Latest review cost · unavailable" },
    { run: { status: "running", cost_usd: null }, value: "…", label: "Latest review in progress" },
    { run: { status: "failed", cost_usd: 0.05 }, value: "$0.050", label: "Latest review failed · cost $0.050" },
    { run: { status: "failed", cost_usd: null }, value: "—", label: "Latest review failed · cost unavailable" },
    { run: { status: "cancelled", cost_usd: 0 }, value: "$0.000", label: "Latest review cancelled · cost $0.000" },
    { run: { status: "cancelled", cost_usd: null }, value: "—", label: "Latest review cancelled · cost unavailable" },
    { run: null, value: "—", label: "No review run" },
  ];
  const rows: PrListItem[] = cases.map(({ run }, i) => ({
    number: i + 1, title: `PR ${i + 1}`, author: "Alice", branch: "test", base: "main",
    head_sha: "abc", additions: 5, deletions: 0, files_count: 1, status: "needs_review", latest_run: run,
  }));
  expect(PrListItem.array().parse(rows)).toEqual(rows);
  expect(PrListItem.safeParse({ ...rows[0], latest_run: { status: "done" } }).success).toBe(false);
  const fetchList = vi.fn(async (_url: string) => Response.json(rows));
  vi.stubGlobal("fetch", fetchList);
  const client = new QueryClient();
  render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
        <PullsPage />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
  await screen.findByText("PR 1");
  const header = screen.getByText("Cost");
  expect(header.previousElementSibling).toHaveTextContent("Status");
  expect(header.nextElementSibling).toHaveTextContent("Updated");
  const column = Array.from(header.parentElement!.children).indexOf(header);
  for (const [i, { value, label }] of cases.entries()) {
    const row = screen.getByText(`PR ${i + 1}`).closest("div[style*='grid']")!;
    const cell = row.children[column] as HTMLElement;
    expect(cell).toHaveAttribute("title", label);
    expect(cell).toHaveClass("mono");
    expect(cell.style.color).toBe("var(--text-muted)");
    expect(cell.querySelector("[aria-hidden=true]")).toHaveTextContent(value);
    expect(cell.querySelector(".sr-only")).toHaveTextContent(label);
    expect(cell.closest("button, a, [tabindex]")).toBeNull();
  }
  fireEvent.click(screen.getByText("$0.015"));
  expect(push).toHaveBeenCalledWith("/repos/acme/pulls/4");
  rows[6]!.latest_run = { status: "done", cost_usd: 0.022 };
  await act(() => client.refetchQueries({ queryKey: ["pulls", "acme"] }));
  expect(await screen.findByText("$0.022")).toBeVisible();
  expect(screen.queryByTitle("Latest review in progress")).toBeNull();
  expect(fetchList).toHaveBeenCalledTimes(2);
  for (const [url] of fetchList.mock.calls) {
    expect(url).toMatch(/\/repos\/acme\/pulls$/);
  }
});
