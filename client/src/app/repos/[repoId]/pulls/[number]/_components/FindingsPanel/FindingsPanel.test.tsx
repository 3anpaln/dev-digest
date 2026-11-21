import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";

vi.mock("../../../../../../../lib/hooks/reviews", () => ({
  useFindingAction: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { FindingsPanel } from "./FindingsPanel";

afterEach(cleanup);

const critical: FindingRecord = {
  id: "f1",
  severity: "CRITICAL",
  category: "security",
  title: "Hardcoded secret",
  file: "src/config.ts",
  start_line: 11,
  end_line: 11,
  rationale: "A secret is committed.",
  suggestion: null,
  confidence: 0.95,
  kind: "finding",
  trifecta_components: null,
  evidence: null,
  review_id: "r1",
  accepted_at: null,
  dismissed_at: null,
};

const findings: FindingRecord[] = [
  critical,
  { ...critical, id: "f2", severity: "WARNING", title: "Boundary warning", confidence: 0.65 },
  { ...critical, id: "f3", severity: "WARNING", title: "Low-confidence warning", confidence: 0.64 },
  { ...critical, id: "f4", severity: "SUGGESTION", title: "Low-confidence suggestion", confidence: 0.4 },
];

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("FindingsPanel", () => {
  it("shows all findings and all severity counts by default", () => {
    renderWithIntl(<FindingsPanel findings={findings} prId="pr1" />);

    const counters = screen.getAllByRole("button", { pressed: false });
    expect(counters.map((button) => button.textContent)).toEqual(["1 CRITICAL", "2 WARNING", "1 SUGGESTION"]);
    expect(screen.getByRole("switch", { name: "Hide low confidence" })).not.toBeChecked();
    for (const finding of findings) {
      expect(screen.getByText(finding.title)).toBeInTheDocument();
    }
  });

  it("shows disabled zero counts and an empty state for a run without findings", () => {
    renderWithIntl(<FindingsPanel findings={[]} prId="pr1" />);
    for (const level of ["CRITICAL", "WARNING", "SUGGESTION"]) {
      expect(screen.getByRole("button", { name: `0 ${level}` })).toBeDisabled();
    }
    expect(screen.getByText("No findings in this run")).toBeInTheDocument();
  });

  it("combines both filters per run and keeps the full severity counts", () => {
    renderWithIntl(
      <>
        <section aria-label="First run">
          <FindingsPanel findings={findings} prId="pr1" />
        </section>
        <section aria-label="Second run">
          <FindingsPanel findings={[critical]} prId="pr1" />
        </section>
      </>,
    );

    const run = within(screen.getByRole("region", { name: "First run" }));
    const otherRun = within(screen.getByRole("region", { name: "Second run" }));
    const hideLow = run.getByRole("switch", { name: "Hide low confidence" });
    const warning = run.getByRole("button", { name: "2 WARNING" });
    const suggestion = run.getByRole("button", { name: "1 SUGGESTION" });
    const otherCritical = otherRun.getByRole("button", { name: "1 CRITICAL" });
    expect(otherRun.getByRole("button", { name: "0 WARNING" })).toBeDisabled();
    fireEvent.click(otherCritical);
    expect(otherCritical.style.background).toContain("var(--crit)");
    expect(otherCritical.style.color).toBe("rgb(255, 255, 255)");

    fireEvent.click(warning);
    expect(warning).toHaveAttribute("aria-pressed", "true");
    expect(warning.style.background).toContain("var(--warn)");
    expect(warning.style.color).toBe("rgb(255, 255, 255)");
    expect(run.getByText("Low-confidence warning")).toBeInTheDocument();
    expect(run.queryByText("Hardcoded secret")).not.toBeInTheDocument();

    fireEvent.click(hideLow);
    expect(warning).toHaveTextContent("2 WARNING");
    expect(run.getByText("Boundary warning")).toBeInTheDocument();
    expect(run.queryByText("Low-confidence warning")).not.toBeInTheDocument();
    expect(run.queryByText("Hardcoded secret")).not.toBeInTheDocument();

    fireEvent.click(suggestion);
    expect(warning).toHaveAttribute("aria-pressed", "false");
    expect(warning.style.background).toBe("transparent");
    expect(warning.style.color).toBe("var(--warn)");
    expect(suggestion).toHaveAttribute("aria-pressed", "true");
    expect(suggestion.style.background).toContain("var(--sugg)");
    expect(suggestion.style.color).toBe("rgb(255, 255, 255)");
    expect(run.getByText("No findings match")).toBeInTheDocument();

    fireEvent.click(hideLow);
    expect(suggestion).toHaveAttribute("aria-pressed", "true");
    expect(run.getByText("Low-confidence suggestion")).toBeInTheDocument();
    expect(run.queryByText("Boundary warning")).not.toBeInTheDocument();

    fireEvent.click(hideLow);
    fireEvent.click(run.getByRole("button", { name: "Clear severity filter" }));
    expect(hideLow).toBeChecked();
    expect(run.queryByRole("button", { pressed: true })).not.toBeInTheDocument();
    expect(suggestion.style.background).toBe("transparent");
    expect(suggestion.style.color).toBe("var(--sugg)");
    expect(run.queryByRole("button", { name: "Clear severity filter" })).not.toBeInTheDocument();
    expect(run.getByText("Hardcoded secret")).toBeInTheDocument();
    expect(run.getByText("Boundary warning")).toBeInTheDocument();
    expect(run.queryByText("Low-confidence warning")).not.toBeInTheDocument();
    expect(otherCritical).toHaveAttribute("aria-pressed", "true");
    expect(otherRun.getByText("Hardcoded secret")).toBeInTheDocument();
    expect(otherRun.getByRole("switch", { name: "Hide low confidence" })).not.toBeChecked();
  });
});
