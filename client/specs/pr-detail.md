# Opening a pull request

- Opening `/repos/<repoId>/pulls/<number>` selects the PR with that GitHub number in that repository. Requests for detail, reviews, and runs use its internal ID.
- Selecting a PR detail tab updates the `tab` query parameter. Opening a trace records the run ID in `trace`, so the URL identifies the view on reload.

[PR detail page](../src/app/repos/[repoId]/pulls/[number]/page.tsx) · [Browser journey](../../e2e/specs/02-repo-pulls-detail.flow.json)
