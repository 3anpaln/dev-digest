import { expect, it } from "vitest";
import type { FindingPreview } from "@devdigest/shared";
import { summarizeFindings } from "./FindingsPreview";

it("counts all findings and prioritizes later critical findings in the three-item preview", () => {
  const severities = ["SUGGESTION", "SUGGESTION", "SUGGESTION", "WARNING", "CRITICAL", "CRITICAL"] as const;
  const findings: FindingPreview[] = severities.map((severity, index) => ({
    id: String(index), severity, category: "bug", title: `Finding ${index}`,
    file: "src/input.ts", start_line: index + 1, end_line: index + 1,
    rationale: "Check the input.", confidence: 0.9,
  }));

  const { counts, preview } = summarizeFindings(findings);
  expect(counts).toEqual({ critical: 2, warning: 1, suggestion: 3 });
  expect(preview.map(({ id }) => id)).toEqual(["4", "5", "3"]);
});
