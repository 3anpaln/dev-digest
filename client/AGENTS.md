# Web studio

- Resolve a GitHub PR number from the browser route to the repository’s internal PR ID before calling PR endpoints.
- Put route-specific UI under the page’s `_components/`. Reuse the API client and TanStack Query hooks in `src/lib/` for requests and cache invalidation.
- Read the [UI references](docs/README.md) when changing routes or shared components, the [PR detail spec](specs/pr-detail.md) when changing navigation, and [insights](insights.md) when debugging run state after a reload.
