---
name: pr-self-review
description: Review pending DevDigest changes against applicable repository skills. Use for a manual PR self review or before opening a pull request.
metadata:
  version: "1.0.0"
---

# PR Self Review

From the repository root, run `node scripts/pr-self-review.mjs --base origin/main`, substituting the intended target. This reviews the proposed commit tree and any pending index and working-tree changes. Inspect a finding in the exact revision named in the report. Check the whole file, relevant caller, schema or configuration before accepting a missing import, broken contract or ownership failure.

Report the verdict, covered files and skills, unresolved critical findings, and any incomplete checks. A critical requires a changed behavior, evidence and an actionable fix. Style preferences belong under suggestions. One confirmed critical blocks the candidate. An unavailable reviewer or incomplete file review requires another run. Recheck the original evidence when addressing a blocker.

When asked to open a PR, use `node scripts/pr-open.mjs --base main` after the intended commits are pushed. The command runs the review and verifies the published head. Manual review on its own authorizes only review. Changes to the review policy take effect in GitHub through the trusted installation.

[Setup, outcomes and GitHub enforcement](../../../docs/pr-self-review.md)
