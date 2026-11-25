# Finding icons and previews

Show compact severity icons and counts in a **Findings** column between **Score** and **Status** on the **Pull Requests** list. Count findings from each agent's latest attempt on that PR. Identify agents by ID and order attempts by start time. Agents without an attempt contribute zero findings. A running, failed, cancelled, or empty latest attempt contributes zero findings. The score still comes from the latest saved review.

In the **Agent runs** timeline, show the same icons under the agent name for completed runs using findings from the review with the matching run ID. Keep the blocker total beside the icons when present.

Use the existing red critical octagon, amber warning triangle, and blue suggestion lightbulb, in that order. Omit zero-count severities. Show a dash in the PR list when there are no findings. In the timeline, keep the existing finding total when no matching review or severity breakdown is available.

Hover, focus, or activate the counts to open a read-only preview for that PR or run. Show the total, then the findings in severity order. The PR preview loads all its findings when opened, while the timeline preview shows up to three. Each item shows its severity icon, title, category, file and line range, confidence, and a short rationale. Scroll within the preview to reach additional findings. With the counts focused, press Down Arrow to move keyboard focus into the preview. Escape, moving focus away, or clicking outside dismisses it.

The PR list endpoint returns a `findings_summary` with counts across all qualifying reviews and up to three initial findings per PR. It returns null when none of the selected attempts has a completed, linked review. Fetch the summaries in batch with the list. When the PR preview opens and its count exceeds the initial items, `GET /pulls/:id/findings` returns the complete set under the same selection rule. The timeline uses the reviews already loaded for PR detail.

## Acceptance criteria

1. If the latest runs for three agents report one critical and one warning, two critical, and one critical and one warning, the PR row shows four critical and two warning. Its popover shows six findings in severity order. Scrolling inside it reaches both warnings. Earlier runs and agents without an attempt contribute zero findings.
2. Opening a PR list preview by mouse or keyboard keeps the user on the list. Escape dismisses the preview. Clicking the PR title still opens that PR. A PR with no findings has a dash and no preview control.
3. Two completed runs from the same agent show the counts and previews for their own run IDs. A run with only suggestions shows a blue suggestion icon and its count. A failed run keeps its error message, and a completed run with no matching review keeps its existing total. Filtering an expanded run leaves the timeline counts and preview intact.
4. Starting a rerun removes the older findings for that agent from the next list response. A failed, cancelled, or empty rerun keeps those findings out of the totals. A successful rerun contributes its own findings, and the other agents continue to contribute theirs.
