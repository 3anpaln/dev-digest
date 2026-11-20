---
name: record-task-insights
description: Captures verified, reusable engineering lessons in the owning DevDigest area's insights.md after task verification and before the final response.
---

# Record task insights

1. **Select a lesson someone can use.** At wrap-up, revisit surprises, user corrections, non-obvious references or requirements, and decisions from the task. Ask: “In what situation would someone who missed this task do something differently because of this note?” Skip routine activity, facts obvious from the referenced code, and candidates with no concrete answer.
2. **Find its owner.** Follow the applicable `AGENTS.md` instructions for the files involved and resolve their insights link relative to that guide. For example, [reviewer-core/AGENTS.md](../../../reviewer-core/AGENTS.md) leads to [reviewer-core/insights.md](../../../reviewer-core/insights.md) for engine behavior. If several packages were involved, place each lesson where a future maintainer would look for it. Use the [root insights](../../../insights.md) for a lesson about the interaction itself. Record each lesson once.
3. **Compare by meaning.** Read the destination, including later corrections. Compare the situation, recommended action, and rationale against the closest existing entry. Skip a paraphrase or another instance of an already documented lesson. If new evidence changes when the advice applies or what someone should do, identify that difference. For example, an existing note that a readiness probe can pass before seeding already covers a report that the workspace route failed after a successful probe.
4. **Ground the advice.** For an unexpected failure, give the recognizable symptom, the relevant condition, and the fix or diagnostic that verification supports. For a decision, give the constraint and why it favored the chosen approach. Link a test, spec, or source location relative to the insights file when useful. If the cause is still uncertain, describe the verified symptom and label the explanation as tentative.
5. **Append only.** Write a distinct lesson at the end in the file's existing style. For a correction or refinement, append a dated follow-up (YYYY-MM-DD) identifying the earlier entry by heading or short quotation. State what changed and under which conditions the newer guidance applies. Preserve prior text and order. Omit empty categories. If every candidate is already covered, finish without writing.

Before replying, confirm that your change to the insights file consists only of text appended at the end. Check the new entry against the evidence and verify its links. Honor task-specific limits on file edits.
