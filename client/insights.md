# Web studio insights

A reload starts a new browser subscription. The PR page first queries the server for active runs and uses their IDs to attach to event streams. If a run disappears after navigation, inspect the active-runs query and its invalidation before debugging event delivery. [PR detail page](src/app/repos/[repoId]/pulls/[number]/page.tsx) · [Review hooks](src/lib/hooks/reviews.ts)
