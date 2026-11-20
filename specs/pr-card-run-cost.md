# Review cost on PR cards and in the run sidebar

On the Pull Requests list, each PR row shows the USD cost of its most recently started agent review. Match the list mockup (images 1 and 4) with a compact, muted monospace value under **COST**, immediately after **STATUS** and before **UPDATED** in the current grid. The badge is plain, noninteractive text within the clickable row.

## Server and API

- “Run all” starts a separate run for each agent. The PR card reports the latest agent’s run, even when several agents start on the same PR milliseconds apart.
- In `GET /repos/:id/pulls`, select one `agent_runs` row per internal `pr_id` in the authorized workspace and repository. Order by `ran_at DESC, id DESC` across all agents, heads and statuses. A manual rerun gets its own run ID. An older run finishing later cannot displace it. Batch this lookup and left-join the selected IDs to `run_traces.run_id` so PRs without traces still appear.
- For each review model request, record one structured usage outcome per attempt in the run's own log, including each map chunk and schema-repair retry. Give the attempt a stable run-local ID. Preserve its normalized `cost_usd` in the saved `trace.log` on success, failure and cancellation. Today's trace writers retain only `t`, `kind` and `msg`. Extend the log-line schema with optional typed usage metadata so older logs remain readable.
- Normalize at call time. Prefer a finite, nonnegative provider-reported USD charge (including explicit zero). Otherwise use the existing `estimateCost` with that attempt's model and both reported nonnegative integer token counts. Missing counts, unknown pricing or an indeterminate charge yield `null` when the provider gives no usable charge. Record an unknown outcome for a dispatched attempt whose billing cannot be determined. A retry scheduled but never dispatched contributes nothing.
- Sum distinct attempt outcomes for the selected run. Count a billed response even if its output failed validation. Ignore duplicate copies of the same outcome, cumulative retry totals, run summaries, shared preparation events and free-text log messages. Conflicting outcomes for one ID, any unknown attempt, or no usable usage records make the total unknown. This rule also covers historical traces and failures before the first model call.
- Extend the list item contract from `PrMeta` in both vendored shared packages. Every list item includes `latest_run`, either JSON `null` (no run) or an object with the selected run's stored `status` and required `cost_usd: number | null`. For example, `{"latest_run":{"status":"done","cost_usd":0.01424}}`. Use USD, retain the full numeric precision of the summed charges on the wire, and reserve rounding for display. Numeric `0` means all contributing charges are known and zero. Return `null` for an unknown total and while the run is running. The existing list fetch supplies the badge with zero additional model calls or per-card requests.

## Client

Use the existing `PRRow`, shared header/row grid and `prReview` translations. Format USD with a dollar sign and three fractional digits, rounded to nearest with ties up. Show positive amounts below $0.0005 as `<$0.001` so only a known zero displays as `$0.000`. Use the following English labels as tooltips and accessible text, including the displayed amount when present.

| Latest run | Visible COST cell | Label |
| --- | --- | --- |
| Completed (`done`) | Amount, e.g. `$0.014`, or `—` for unknown | Latest review cost · {amount or “unavailable”} |
| In progress (`running`) | `…` until the list refetches with a terminal result | Latest review in progress |
| Failed or cancelled | Amount if fully accounted for, otherwise `—` | Latest review failed/cancelled · cost {amount or “unavailable”}, using the actual state |
| No run | `—` | No review run |

### Agent run sidebar

In the selected run’s **Trace → Stats** section, show four equal-width tiles in order: **Duration**, **Tokens**, **Cost**, **Findings**. Use the existing stat tile with its muted uppercase label and bold value. Read `stats.cost_usd` from the existing `GET /runs/:id/trace` response. Compute it from that run’s saved attempt log using the same accounting rules as the PR list, including when viewing an older run.

Format the sidebar value in USD to two decimal places (for example, `$0.06`). Show `$0.00` for known zero, `<$0.01` for a positive cost below one cent, and `—` for unavailable or incomplete usage.

## Acceptance criteria

1. A Postgres list-route test seeds two agents on one PR, an older run that finishes last, and an identically numbered PR in another repo. Only the newest local-to-that-PR run supplies status and cost. Equal start times select the greater run ID. A newer run with no trace returns its own status and null cost.
2. Attempts costing `0.00412` (rejected output), `0.00612` (repair) and `0.004` (another chunk) yield `0.01424`, even with a replayed repair entry and a cumulative summary. A provider charge overrides a token estimate. An attempt with both counts and known rates can supply an estimate by itself.
3. Verify the actual list JSON for a zero-priced run (numeric `0`), a mixed known/unknown run (`cost_usd: null`), a legacy message-only trace (`cost_usd: null`), and a PR without runs (`latest_run: null`). A failure after a fully priced response retains its amount after reload.
4. Render each state in the table. Assert column placement, visible text and accessible labels, including `$0.014` for `0.01424`, `$0.000` for zero, and `<$0.001` for `0.0001`. Refetching a running row as completed replaces the ellipsis with its amount. Clicking the cost still opens that PR.

5. Opening a saved run shows its own cost in the third Stats tile, including when a newer review exists on the same PR. The tile uses the existing trace request.

## Test verification

| Level and behavior | Setup | Expected result |
| --- | --- | --- |
| Run sidebar · selected trace | Open an older trace costing USD 0.06 after a newer run with a different cost. Also open traces with zero, sub-cent and missing charges. | The third Stats tile reads **COST $0.06** for the older run. The other cases show `$0.00`, `<$0.01` and `—` respectively. |
| API integration · latest start | In Postgres, start a review, then manually rerun it on the same PR. Finish the original run last with a different charge. Read `GET /repos/:id/pulls` while the rerun is running and again after both finish. | The row first reports `running` with null cost, then `done` with only the rerun's charge. |
| API integration · tied starts | Give two agents' runs on one PR identical `ran_at` values and distinct charges. Insert the greater run ID first. | The list returns the status and charge of the greater run ID. |
| API integration · missing trace | Seed a PR with an older priced run and a newer failed run without a trace. Include a second PR with no runs. | Both PRs appear. The first has `latest_run: {"status":"failed","cost_usd":null}`. The second has `latest_run: null`. |
| API integration · attempt accounting | Drive a two-chunk review with a stub provider. The first chunk's rejected response costs `0.00412`, its successful schema-repair retry costs `0.00612`, and the second chunk costs `0.004`. Replay the repair log entry with its original attempt ID and include a cumulative summary. | The saved trace identifies three distinct attempts. The list returns numeric `cost_usd: 0.01424`, counting each dispatched attempt once. |
| UI · values and states | Render list rows with costs `0.01424`, `0`, `0.0001` and `0.0145`, plus the unknown, running, failed, cancelled and no-run cases from the client table. | Within the corresponding rows, expect `$0.014`, `$0.000`, `<$0.001` and `$0.015`. Each state has the specified cell text, tooltip and accessible label. |
| UI · layout and navigation | Open the seeded list in a browser with two differently priced PRs. Inspect each cost cell and click the second PR's cost text. | Each value aligns under **COST** between **STATUS** and **UPDATED**, with the theme's muted text color and a monospace font. The text has no separate link or button. Clicking it opens the second PR's detail URL. |
