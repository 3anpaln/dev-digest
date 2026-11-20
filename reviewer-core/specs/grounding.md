# Grounding review findings

- Drop a finding if its file is absent from the diff.
- For a line-based finding, keep it when its cited range intersects a new-side hunk in that file. For a supported full-file finding kind, file membership is sufficient.
- Apply grounding to the merged result, retain drop reasons for tracing, and compute the final score from the kept findings.

[Grounding rules](../src/grounding.ts) · [Review pipeline](../src/review/run.ts) · [Engine tests](../test/run.test.ts)
