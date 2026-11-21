/**
 * RunHistory — the badge must reflect the review OUTCOME, not the run lifecycle.
 * Regression guard for the "green ✓ done on a run that found 5 blockers" bug:
 * a settled run is colored/labelled by its denormalized blocker/finding counts,
 * and shows the review score ring.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReviewRecord, RunSummary } from "@devdigest/shared";
import { useCancelRun } from "@/lib/hooks/reviews";
import messages from "../../../../../../../../messages/en/prReview.json";
import { RunHistory } from "./RunHistory";
import { RunCostAmount } from "../RunCostAmount";
import { FindingsTab } from "../FindingsTab/FindingsTab";

afterEach(cleanup);

function run(o: Partial<RunSummary>): RunSummary {
  return {
    run_id: "run-1",
    agent_id: "a1",
    agent_name: "Security Reviewer",
    provider: "openrouter",
    model: "deepseek/deepseek-v4-flash",
    status: "done",
    error: null,
    duration_ms: 1000,
    tokens_in: 100,
    tokens_out: 50,
    cost_usd: null,
    findings_count: 0,
    grounding: "0/0 passed",
    ran_at: "2026-06-11T18:44:34.000Z",
    score: null,
    blockers: null,
    ...o,
  };
}

function renderRuns(runs: RunSummary[]) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <RunHistory runs={runs} onOpenTrace={() => {}} />
    </NextIntlClientProvider>,
  );
}

describe("RunHistory — outcome badge", () => {
  it("a done run WITH blockers reads 'rejected' (never green 'done') + shows the score ring", () => {
    renderRuns([run({ status: "done", findings_count: 5, blockers: 5, score: 0 })]);
    expect(screen.getByText("rejected")).toBeInTheDocument();
    expect(screen.queryByText("done")).not.toBeInTheDocument();
    expect(screen.getByText("0")).toBeInTheDocument(); // CircularScore renders the number
    expect(screen.getByText(/5 blockers/)).toBeInTheDocument();
  });

  it("a clean done run reads 'approved'", () => {
    renderRuns([run({ status: "done", findings_count: 0, blockers: 0, score: 95 })]);
    expect(screen.getByText("approved")).toBeInTheDocument();
    expect(screen.getByText("95")).toBeInTheDocument();
  });

  it("a done run with non-blocking findings reads 'reviewed'", () => {
    renderRuns([run({ status: "done", findings_count: 3, blockers: 0, score: 72 })]);
    expect(screen.getByText("reviewed")).toBeInTheDocument();
    expect(screen.queryByText(/blockers/)).not.toBeInTheDocument();
  });

  it("a failed run reads 'error'", () => {
    renderRuns([run({ status: "failed", error: "boom", score: null, blockers: null })]);
    expect(screen.getByText("error")).toBeInTheDocument();
  });

  it("a running run reads 'running'", () => {
    renderRuns([run({ status: "running", score: null, blockers: null })]);
    expect(screen.getByText("running")).toBeInTheDocument();
  });
});

it("falls back to three decimals for unsupported runtime precision", () => {
  const unsupportedDigits = 999 as 3 | 4;
  render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <RunCostAmount cost={0.00126} digits={unsupportedDigits} />
      <RunCostAmount cost={0.00001} digits={unsupportedDigits} />
    </NextIntlClientProvider>,
  );
  expect(screen.getByText("$0.001")).toBeInTheDocument();
  expect(screen.getByText("<$0.001")).toBeInTheDocument();
});

it("matches timeline findings and costs to the run ID, including runs by the same agent", () => {
  const reviews = ["run-2", "run-1"].map((id): ReviewRecord => ({
    id: `review-${id}`, pr_id: "pr-1", run_id: id, agent_id: "a1",
    agent_name: "Security Reviewer", kind: "review", verdict: null,
    summary: null, score: 38, model: null, created_at: "2026-06-11T18:44:34.000Z", findings: [{
      id: `finding-${id}`, review_id: `review-${id}`,
      severity: id === "run-1" ? "WARNING" : "SUGGESTION",
      title: `Finding for ${id}`, category: "bug", file: "src/input.ts",
      start_line: 9, end_line: 9, confidence: 0.9, rationale: "Check the input.",
      accepted_at: null, dismissed_at: null,
    }],
  }));
  const runs = [
    run({ cost_usd: 0.00126, tokens_in: 9000, tokens_out: 119, findings_count: 1 }),
    run({ run_id: "run-2", cost_usd: 0, findings_count: 1 }),
    run({ run_id: "run-3", status: "failed", error: "Provider unavailable", tokens_in: 0, tokens_out: 0 }),
  ];
  function View() {
    const cancel = useCancelRun();
    return (
      <FindingsTab prId="pr-1" liveRunIds={[]} reviewRunning={false} lethalTrifecta={[]}
        runs={reviews} prRuns={runs} prCommits={[]} cancelMutation={cancel}
        onOpenTrace={() => {}} onDelete={() => {}} onRunDone={() => {}} />
    );
  }
  const { container } = render(
    <QueryClientProvider client={new QueryClient()}>
      <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
        <View />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
  expect(screen.getByText("$0.0013").parentElement).toHaveTextContent("9,119 tok · $0.0013");
  expect(screen.getByText("$0.0000")).toBeInTheDocument();
  expect(screen.queryByTitle("Run cost · unavailable")).toBeNull();
  const first = within(container.querySelector<HTMLElement>("#review-run-run-1")!);
  const second = within(container.querySelector<HTMLElement>("#review-run-run-2")!);
  expect(first.getByText("$0.001").previousElementSibling).toHaveTextContent("38");
  expect(second.getByText("$0.000")).toBeInTheDocument();
  fireEvent.mouseEnter(screen.getByRole("button", { name: "Preview findings · 1 warning" }));
  const region = () => screen.getByRole("region", { name: "1 finding in this run" });
  expect(region()).toHaveTextContent("Finding for run-1");
  expect(region()).not.toHaveTextContent("Finding for run-2");
  fireEvent.keyDown(document, { key: "Escape" });
  fireEvent.focus(screen.getByRole("button", { name: "Preview findings · 1 suggestion" }));
  expect(region()).toHaveTextContent("Finding for run-2");
  expect(screen.getByText("Provider unavailable")).toBeInTheDocument();
});
