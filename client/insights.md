# Web studio insights

A reload starts a new browser subscription. The PR page first queries the server for active runs and uses their IDs to attach to event streams. If a run disappears after navigation, inspect the active-runs query and its invalidation before debugging event delivery. [PR detail page](src/app/repos/[repoId]/pulls/[number]/page.tsx) · [Review hooks](src/lib/hooks/reviews.ts)

When a React rerender warns about a border shorthand, check for an aggregate property such as `borderColor` alongside a side-specific property such as `borderLeftColor`. Use independent side declarations when a semantic accent must survive a focus change. [Finding card regression test](src/app/repos/[repoId]/pulls/[number]/_components/FindingCard/FindingCard.test.tsx)

When localizing review costs, use the same formatter for small-charge thresholds and ordinary amounts. The locale controls separators and symbol placement, while the currency stays USD. [Trace formatting regression](src/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer/RunTraceDrawer.test.tsx)

When showing per-run metadata in a review accordion, match the review to the run summary by run_id. The same agent can review a PR multiple times, and the review and timeline sections can order those records differently. [Agent runs display test](src/app/repos/[repoId]/pulls/[number]/_components/RunHistory/RunHistory.test.tsx)

Build severity counters from the full findings array for each run. The confidence filter can hide every finding in a severity that still has a positive count, so exercise that case separately from a severity with zero findings. [Severity counters and filtering](specs/pr-detail.md#severity-counters-and-filtering)

A runtime import from `@devdigest/shared` can make Next.js report `Can't resolve './contracts/findings.js'` even when the client tests and typecheck pass. For a fixed set of UI choices, declare the values in the component’s constants and check them with the shared type through a type-only import. Verify the affected Next.js route compiles when introducing a new runtime import from the vendored contracts. [Findings panel constants](src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/constants.ts)
