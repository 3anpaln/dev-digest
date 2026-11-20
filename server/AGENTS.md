# API and repository indexing

- Install reviewer-core dependencies before working on the API in isolation. From a fresh database, run `pnpm db:migrate` followed by `pnpm db:seed` to create the local identity.
- Scope feature requests to the workspace resolved by the auth provider. Resolve GitHub and model clients through the dependency container so tests can substitute adapters.
- Query repository context through the repo-intel facade. Keep clone and index work in background jobs.
- Run DB-free checks with `pnpm exec vitest run --exclude '**/*.it.test.ts'`. Run the Postgres suite with `pnpm exec vitest run .it.test`.
- Read the [server references](docs/README.md) when changing route or index wiring, the [run lifecycle spec](specs/review-runs.md) for review orchestration, and [insights](insights.md) for startup or diff fallback issues.
