# Pull request detail

## Opening a pull request

- Opening `/repos/<repoId>/pulls/<number>` selects the PR with that GitHub number in that repository. Requests for detail, reviews, and runs use its internal ID.
- Selecting a PR detail tab updates the `tab` query parameter. Opening a trace records the run ID in `trace`, so the URL identifies the view on reload.

[PR detail page](../src/app/repos/[repoId]/pulls/[number]/page.tsx) · [Browser journey](../../e2e/specs/02-repo-pulls-detail.flow.json)

## Severity counters and filtering

The [finding icons and previews spec](../../specs/pr-finding-previews.md) covers the Pull Requests list and the Agent runs timeline.

On the **Agent runs** tab, show severity buttons directly above each expanded run’s findings in **CRITICAL**, **WARNING**, **SUGGESTION** order. Show buttons only for severities with findings. Each button shows the count from that run’s full set of findings, for example `3 CRITICAL · 5 WARNING · 2 SUGGESTION`. Selecting a severity shows only matching findings in that run, in their existing order. Give the selected button a solid fill in its severity color and white text in both themes, and expose its pressed state to assistive technology. Keep the severity-colored text and outline for unselected buttons. Show a **Clear severity filter** button while a severity is active.

### Hide low confidence

**Hide low confidence** defaults to off for each expanded run. A finding is visible when it matches the selected severity (or no severity is selected) and either the toggle is off or its confidence is at least 65%, the existing cutoff. Turning the toggle off keeps the selected severity. Clearing severity keeps the toggle setting. Severity counts always reflect the full run, and both controls apply only to that run. If the filters hide every finding in a run, show **No findings match** and keep both controls available.

### Acceptance criteria

1. **Default**. Expand a run with 3 critical, 5 warning, and 2 suggestion findings. With **Hide low confidence** off, all 10 findings appear and no severity is selected. The counter row displays `3 CRITICAL · 5 WARNING · 2 SUGGESTION`.
2. **Apply and switch**. Select **WARNING** and verify that exactly five warning findings appear and **WARNING** has an amber fill and white text. Select **SUGGESTION** and verify that exactly two suggestion findings appear, the solid blue fill and white text move to **SUGGESTION**, and **WARNING** returns to its outline. Selecting **CRITICAL** gives it a solid red fill with white text. The counters stay at 3, 5, and 2 throughout. A second expanded run keeps its own selection, findings, and counts when applying, switching, or clearing the first run’s filter.
3. **Clear**. Select **Clear severity filter**. All 10 findings return in their original order when **Hide low confidence** is off. All severity buttons return to their default outlined style and the clear button disappears.
4. **Zero counts**. A run with only two warnings shows a single selectable `2 WARNING` button. A run with no findings shows its empty state and no severity buttons.
5. **Combine filters**. In a run with warnings at 64% and 65% confidence and a critical finding at 90%, select **WARNING** and turn **Hide low confidence** on. Only the 65% warning appears, and the counters still show one critical and two warnings. Turn the toggle off and verify that both warnings return while **WARNING** stays selected. Turn it on again and clear severity. The 65% warning and 90% critical finding appear, while the 64% warning stays hidden. A second expanded run keeps its own toggle and selection throughout.
6. **No matches**. With **Hide low confidence** on, select a severity whose findings are all below 65%. Its count stays positive, the severity remains selected, and **No findings match** appears. Turning off the toggle restores that severity’s findings.

### Assumptions

- One severity can be active per run. Selecting a different severity replaces the current selection. Selecting the active severity again keeps it selected.
- A run starts with no severity selected each time it is expanded. Severity selections are discarded when leaving the tab or reloading the page.
