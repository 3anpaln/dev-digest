---
name: record-task-insights
description: Review a completed DevDigest task after verification and before the final response. Capture reusable lessons in the owning area's insights.md when the task adds or refines one.
---

# Record task insights

1. **Identify the lesson.** Consider the files examined or changed, user corrections, and verification results from this task. Keep a non-obvious reference or requirement, a correction, an unexpected finding, or an execution decision only if it could change how someone approaches similar work. Skip routine activity and lessons already fully documented. If nothing qualifies, finish without an edit.
2. **Find its owner.** Follow the applicable `AGENTS.md` instructions for the files involved and resolve their insights link relative to that guide. For example, [reviewer-core/AGENTS.md](../../../reviewer-core/AGENTS.md) leads to [reviewer-core/insights.md](../../../reviewer-core/insights.md) for engine behavior. If several packages were involved, place each lesson where a future maintainer would look for it. Use the [root insights](../../../insights.md) for a lesson about the interaction itself. Record each lesson once.
3. **Append only.** Read the existing entries, including any later corrections. Append a distinct lesson at the end of the file in its existing paragraph, bullet, or heading style. For a correction or refinement, append a follow-up that identifies the earlier entry by heading or a short quotation and states what changed. Preserve all prior text and its order. Skip duplicates and empty categories.
4. **Write for the next task.** State what was learned, why it affects a decision, and when it applies. For a correction, capture the corrected understanding. For an execution decision, capture the constraint that made it appropriate. Distinguish observed behavior from an inference. Link relevant source, test, or spec files using paths relative to the insights file.

Before replying, confirm that your change to the insights file consists only of text appended at the end. Check the new entry against the evidence and verify its links. Honor task-specific limits on file edits.
