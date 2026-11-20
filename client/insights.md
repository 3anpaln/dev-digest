# Web studio insights

A reload starts a new browser subscription. The PR page first queries the server for active runs and uses their IDs to attach to event streams. If a run disappears after navigation, inspect the active-runs query and its invalidation before debugging event delivery. [PR detail page](src/app/repos/[repoId]/pulls/[number]/page.tsx) · [Review hooks](src/lib/hooks/reviews.ts)

When a React rerender warns about a border shorthand, check for an aggregate property such as `borderColor` alongside a side-specific property such as `borderLeftColor`. Use independent side declarations when a semantic accent must survive a focus change. [Finding card regression test](src/app/repos/[repoId]/pulls/[number]/_components/FindingCard/FindingCard.test.tsx)

When localizing review costs, use the same formatter for small-charge thresholds and ordinary amounts. The locale controls separators and symbol placement, while the currency stays USD. [Trace formatting regression](src/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer/RunTraceDrawer.test.tsx)
