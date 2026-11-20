# Review cost on PR cards, Agent runs, and in the run sidebar

On the Pull Requests list, each PR row shows the total USD cost of its review history across all agents, commit heads, and reruns. Match the list mockup (images 1 and 4) with a compact, muted monospace value under **COST**, immediately after **STATUS** and before **UPDATED** in the current grid. The badge is plain, noninteractive text within the clickable row.

## Server and API

- In `GET /repos/:id/pulls`, batch-select all review runs by internal PR ID in the authorized workspace and repository. Left-join `run_traces` by run ID. Include each agent from “Run all”, each manual rerun, and any failed or cancelled run with fully accounted usage.
- For each review model request, record one structured usage outcome per attempt in the run's own log, including each map chunk and schema-repair retry. Give the attempt a stable run-local ID and preserve its normalized `cost_usd` in the saved `trace.log` on success, failure and cancellation.
- Normalize at call time. Prefer a finite, nonnegative provider-reported USD charge (including explicit zero). Otherwise use the existing `estimateCost` with that attempt's model and both reported nonnegative integer token counts. Missing counts, unknown pricing or an indeterminate charge yield `null` when the provider gives no usable charge. Record an unknown outcome for a dispatched attempt whose billing cannot be determined. A retry scheduled but never dispatched contributes nothing.
- Sum distinct attempt outcomes within each run, then sum the run totals per PR. Count billed responses even if output validation failed. Ignore exact replays, cumulative summaries, shared preparation events and free-text messages. A missing trace, conflicting outcome, unknown attempt or lack of usable usage makes that run and the PR total unknown.
- Each `PrListItem` includes `review_cost` in both vendored shared contracts. It is JSON `null` for a PR with no runs. Otherwise it contains a boolean `running` and a finite, nonnegative `cost_usd: number | null`. `running` is true while any run is active and `cost_usd` is then null. For a fully priced history, return the unrounded USD total, for example `{"review_cost":{"running":false,"cost_usd":0.0231119252}}`. Numeric zero represents a fully accounted total of zero. Use the existing list fetch.

## Client

Use the active application locale for number formatting on both surfaces. The currency is USD.

Use the existing `PRRow`, shared header/row grid and `prReview` translations. Format USD with a dollar sign and three fractional digits, rounded to nearest with ties up. Show positive amounts below $0.0005 as `<$0.001` so only a known zero displays as `$0.000`. Use the following English labels as tooltips and accessible text, including the displayed amount when present.

| Review history | Visible COST cell | Label |
| --- | --- | --- |
| All runs settled | Amount, e.g. `$0.023`, or `—` for unknown | Total review cost · {amount or “unavailable”} |
| Any run in progress | `…` until the list refetches after all runs settle | Review in progress |
| No run | `—` | No review run |

### Agent runs tab

- Extend `GET /pulls/:id/runs` with a nullable numeric `cost_usd` on each run summary. Compute it from that run’s saved attempt log. Return null while the run is active or when usage is unavailable. Both sections use this list response.
- In **Timeline**, place a muted monospace line below the run timestamp showing input plus output tokens and USD cost, for example `9,119 tok · $0.0013`. Show four decimal places. Completed runs with unknown cost show `—`. Failed or cancelled runs show the line when they have recorded tokens or a known cost. Active runs and commit entries omit the line.
- In **Review runs**, place the matching run’s cost after the score and before the timestamp. Match the review to its run by `run_id`. Show three decimal places, for example `$0.001`, or `—` for unknown cost or a review without a matching run. Both sections format known zero as zero and use a less-than threshold when a positive charge would round to zero.

### Agent run sidebar

In the selected run’s **Trace → Stats** section, show four equal-width tiles in order: **Duration**, **Tokens**, **Cost**, **Findings**. Use the existing stat tile with its muted uppercase label and bold value. Read `stats.cost_usd` from the existing `GET /runs/:id/trace` response. Compute it from that run’s saved attempt log using the same accounting rules as the PR list, including when viewing an older run.

Format the sidebar value in USD to two decimal places (for example, `$0.06`). Show `$0.00` for known zero, `<$0.01` for a positive cost below one cent, and `—` for unavailable or incomplete usage.

## Acceptance criteria

1. A Postgres list-route test seeds multiple agents and a rerun on one PR. Every in-scope run contributes regardless of start or finish order. A run in another repo or workspace contributes nothing.
2. Attempts costing `0.00412` (rejected output), `0.00612` (repair) and `0.004` (another chunk) yield `0.01424`, even with a replayed repair entry and a cumulative summary. A provider charge overrides a token estimate. An attempt with both counts and known rates can supply an estimate by itself.
3. Verify numeric `0` for a fully priced zero-cost history and `cost_usd: null` when any run lacks a reliable cost. A PR without runs has `review_cost: null`. A failed or cancelled run with fully priced responses contributes its charge.
4. Render each state in the table. Assert column placement, visible text and accessible labels, including `$0.014` for `0.01424`, `$0.000` for zero, and `<$0.001` for `0.0001`. Refetching a running row as completed replaces the ellipsis with its amount. Clicking the cost still opens that PR.

5. Opening a saved run shows its own cost in the third Stats tile, including when a newer review exists on the same PR. The tile uses the existing trace request.
6. Two runs by the same agent display their own charges in the timeline and matching review headers. A run costing USD 0.00126 with 9,119 tokens shows `9,119 tok · $0.0013` in the timeline and `$0.001` in the header. A failed run with no recorded usage displays its error alone.

## Test verification

| Level and behavior | Setup | Expected result |
| --- | --- | --- |
| Run sidebar · selected trace | Open an older trace costing USD 0.06 after a newer run with a different cost. Also open traces with zero, sub-cent and missing charges. | The third Stats tile reads **COST $0.06** for the older run. The other cases show `$0.00`, `<$0.01` and `—` respectively. |
| API integration · all runs | Seed an original run, its rerun, and a run by another agent with charges of `0.005`, `0.01424`, and `0.007`. Give the last two the same start time and finish the original last. Include a priced foreign-workspace run referencing the same PR. | While any run is active, return `running: true` and null cost. Once all local runs settle with traces, return `running: false` and a total of `0.02624`. |
| API integration · missing trace | Seed a PR with an older priced run and a newer failed run without a trace. Include a second PR with no runs. | Both PRs appear. The first has `review_cost: {"running":false,"cost_usd":null}`. The second has `review_cost: null`. |
| API integration · attempt accounting | Drive a two-chunk review with a stub provider. The first chunk's rejected response costs `0.00412`, its successful schema-repair retry costs `0.00612`, and the second chunk costs `0.004`. Replay the repair log entry with its original attempt ID and include a cumulative summary. | The saved trace identifies three distinct attempts. The list returns numeric `cost_usd: 0.01424`, counting each dispatched attempt once. |
| UI · values and states | Render list rows with costs `0.01424`, `0`, `0.0001` and `0.0145`, plus the unknown, running, failed, cancelled and no-run cases from the client table. | Within the corresponding rows, expect `$0.014`, `$0.000`, `<$0.001` and `$0.015`. Each state has the specified cell text, tooltip and accessible label. |
| UI · layout and navigation | Open the seeded list in a browser with two differently priced PRs. Inspect each cost cell and click the second PR's cost text. | Each value aligns under **COST** between **STATUS** and **UPDATED**, with the theme's muted text color and a monospace font. The text has no separate link or button. Clicking it opens the second PR's detail URL. |
