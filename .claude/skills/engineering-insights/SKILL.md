---
name: engineering-insights
description: Record verified, reusable DevDigest engineering lessons with dates and line-numbered source links after task verification.
---

# Engineering insights

1. **Select a lesson someone can use.** At wrap-up, revisit surprises, user corrections, non-obvious references or requirements, and decisions from the task. Ask: “In what situation would someone who missed this task do something differently because of this note?” Skip routine activity, facts obvious from the referenced code, and candidates with no concrete answer.
2. **Find its owner.** Follow the applicable `AGENTS.md` instructions for the files involved and resolve their insights link relative to that guide. For example, [reviewer-core/AGENTS.md](../../../reviewer-core/AGENTS.md) leads to [reviewer-core/insights.md](../../../reviewer-core/insights.md) for engine behavior. If several packages were involved, place each lesson where a future maintainer would look for it. Use the [root insights](../../../insights.md) for a lesson about the interaction itself. Record each lesson once.
3. **Compare by meaning.** Read the destination, including later corrections. Compare the situation, recommended action, and rationale against the closest existing entry. Skip a paraphrase or another instance of an already documented lesson. If new evidence changes when the advice applies or what someone should do, identify that difference. For example, an existing note that a readiness probe can pass before seeding already covers a report that the workspace route failed after a successful probe.
4. **Ground the advice.** For an unexpected failure, give the recognizable symptom, the relevant condition, and the fix or diagnostic that verification supports. For a decision, give the constraint and why it favored the chosen approach. Verify the line number for every link in the entry. Use paths relative to the insights file, with `#L42` for source files and `?plain=1#L42` for Markdown files on GitHub. Cite an external source in prose if it has no line-numbered URL. If the cause is still uncertain, describe the verified symptom and label the explanation as tentative.
5. **Append only.** Start every new entry or follow-up with the current date in bold `YYYY-MM-DD` format, such as `**2026-01-15**`. For a correction or refinement, identify the earlier entry by heading or short quotation and explain when the newer guidance applies. Preserve prior text and order. Omit empty categories. If every candidate is already covered, finish without writing.

Before replying, confirm that the change consists only of text appended at the end, every new entry has its date, and every link resolves to the cited line. Check the entry against the evidence and honor task-specific limits on file edits.
