# API insights

- A successful readiness probe confirms database connectivity. Workspace routes also need the user and workspace created by the seed. [Health routes](src/app.ts) · [Local auth](src/adapters/auth/local.ts)
- When a Git diff is unavailable, the review can use patches persisted during PR import. For an unexpected diff, check which source supplied it and which head SHA the PR row records. [Diff loader](src/modules/reviews/diff-loader.ts) · [PR import](src/modules/pulls/routes.ts)
