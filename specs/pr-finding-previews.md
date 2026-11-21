# Finding icons and previews

Show compact severity icons and counts in a **Findings** column between **Score** and **Status** on the **Pull Requests** list. Use the latest saved review that supplies the PR's score. In the **Agent runs** timeline, show the same icons under the agent name for completed runs using findings from the review with the matching run ID. Keep the blocker total beside the icons when present.

Use the existing red critical octagon, amber warning triangle, and blue suggestion lightbulb, in that order. Omit zero-count severities. Show a dash in the PR list when there are no findings. In the timeline, keep the existing finding total when no matching review or severity breakdown is available.

Hover, focus, or activate the counts to open a read-only preview for that PR or run. Show the total and up to three findings, critical first, then warning and suggestion. Each item shows its severity icon, title, category, file and line range, confidence, and a short rationale. Escape, moving focus away, or clicking outside dismisses the preview. Opening a preview leaves PR navigation, timeline actions, and expanded-run filters independent.

The PR list endpoint returns a `findings_summary` with counts and the bounded preview for the latest saved review. A PR without a saved review returns null. Fetch the summaries in batch with the list. The timeline uses the reviews already loaded for PR detail.

## Acceptance criteria

1. A latest review with two critical, one warning, and two suggestion findings shows three icon counts in both severity order and the correct grid column. Its preview shows five findings in the heading and at most three items in severity order. An older review leaves these values unchanged.
2. Opening a PR list preview by mouse or keyboard keeps the user on the list. Escape dismisses the preview. Clicking the PR title still opens that PR. A PR with no findings has a dash and no preview control.
3. Two completed runs from the same agent show the counts and previews for their own run IDs. A run with only suggestions shows a blue suggestion icon and its count. A failed run keeps its error message, and a completed run with no matching review keeps its existing total. Filtering an expanded run leaves the timeline counts and preview intact.
