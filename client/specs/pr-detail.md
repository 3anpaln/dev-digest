# Pull request detail

## Opening a pull request

- Opening `/repos/<repoId>/pulls/<number>` selects the PR with that GitHub number in that repository. Requests for detail, reviews, and runs use its internal ID.
- Selecting a PR detail tab updates the `tab` query parameter. Opening a trace records the run ID in `trace`, so the URL identifies the view on reload.

[PR detail page](../src/app/repos/[repoId]/pulls/[number]/page.tsx) · [Browser journey](../../e2e/specs/02-repo-pulls-detail.flow.json)

## Severity counters and filtering

On the **Agent runs** tab, show three severity buttons directly above each expanded run’s findings in **CRITICAL**, **WARNING**, **SUGGESTION** order. Each button shows the count from that run’s full set of findings, for example `3 CRITICAL · 5 WARNING · 2 SUGGESTION`. Selecting a severity shows only matching findings in that run, in their existing order. Give the selected button a distinct visual treatment and expose its pressed state to assistive technology. Show a **Clear severity filter** button while a severity is active.

### Acceptance criteria

1. **Default**. Expand a run with 3 critical, 5 warning, and 2 suggestion findings. With **Hide low confidence** off, all 10 findings appear and no severity is selected. The counter row displays `3 CRITICAL · 5 WARNING · 2 SUGGESTION`.
2. **Apply and switch**. Select **WARNING** and verify that exactly five warning findings appear and **WARNING** is marked active. Select **SUGGESTION** and verify that exactly two suggestion findings appear and only **SUGGESTION** is marked active. The counters stay at 3, 5, and 2 throughout. A second expanded run keeps its own selection, findings, and counts when applying, switching, or clearing the first run’s filter.
3. **Clear**. Select **Clear severity filter**. All 10 findings return in their original order when **Hide low confidence** is off. No severity is selected and the clear button disappears.
4. **Zero counts**. A run with only two warnings shows `0 CRITICAL · 2 WARNING · 0 SUGGESTION`. **WARNING** can still be selected. A run with no findings shows all three zero counts and an empty state indicating that the run has no findings. In both cases, all zero-count buttons are disabled.
5. **Confidence filter**. Select a severity with findings above and below the confidence threshold, then enable **Hide low confidence**. Only findings that pass both filters appear, and the counters stay the same. Switch to a severity whose findings are all below the threshold. The list shows **No findings match** and the selection stays clearable. Clearing the severity restores all findings that pass the confidence filter.

### Assumptions

- One severity can be active per run. Selecting a different severity replaces the current selection. Selecting the active severity again keeps it selected.
- A run starts with no severity selected each time it is expanded. Severity selections are discarded when leaving the tab or reloading the page.
- Zero-count buttons remain visible and disabled. The severity and confidence filters apply together, and clearing severity preserves the confidence setting.
