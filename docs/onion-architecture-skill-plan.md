# Onion Architecture skill plan

Plan for a repository skill named `onion-architecture`, displayed as **Onion Architecture** and initially versioned `1.0.0`. It will guide writing, reviewing, and refactoring DevDigest backend modules. Its core rule is that source dependencies point toward business policy. The code that needs storage, a model, or a job runner defines the contract it needs. An outer adapter implements that contract, and the existing composition root supplies the implementation. Use the smallest set of modules that makes these boundaries enforceable. Palermo explicitly allows the number of layers to vary. [Original Onion Architecture][onion-1] · [Interface and composition example][onion-2] · [Dependency direction and testability][onion-3]

## Repository findings

- The Fastify app registers feature route plugins through a static registry. The platform container already assembles repositories and production adapters, with overrides for tests. Use these existing seams for the architecture. [Server request and dependency flow](../server/README.md#request--di-flow) · [Feature registry](../server/src/modules/index.ts) · [Container](../server/src/platform/container.ts)
- `AgentsService` receives the whole `Container` and imports a concrete repository. Its repository holds a decision about when an agent configuration change creates a version. This is a small, concrete use case for a pilot that keeps the version rule testable and the writes consistent. [Agents service](../server/src/modules/agents/service.ts) · [Agents repository](../server/src/modules/agents/repository.ts)
- The review service imports a cost helper from the pulls module, and the executor uses database row and schema types. The repo-intel facade and reviewer-core's supplied model client already illustrate boundaries worth preserving. Review orchestration is a later migration candidate because background jobs, cancellation, SSE, and atomic persistence all matter to its behavior. [Review service](../server/src/modules/reviews/service.ts) · [Review executor](../server/src/modules/reviews/run-executor.ts) · [Run lifecycle](../server/specs/review-runs.md) · [Repo-intel facade](../server/src/modules/repo-intel/README.md#facade-repointel) · [Reviewer-core instructions](../reviewer-core/AGENTS.md)

## What the skill will enforce

| Boundary | Responsibility and allowed dependencies |
| --- | --- |
| Domain | Owns product rules, calculations, and state transitions in plain TypeScript. May depend on other domain code and explicitly approved, platform-neutral types. |
| Application | Orchestrates use cases and expresses the I/O it needs through application-owned interfaces or function types. May depend on its domain and explicitly exposed application contracts. Expresses transaction needs in use-case terms. |
| Inbound adapters | Fastify routes and job handlers translate requests or events to use-case inputs, then translate outcomes to HTTP responses or job results. They pass the trusted workspace and actor context. |
| Outbound adapters | Implement the application's I/O contracts using PostgreSQL, Git, GitHub, model providers, or queues. They map storage and SDK types to the shapes their consumers need. |
| Composition | The app bootstrap and platform container construct concrete dependencies and inject them. Use cases receive the ports they need through constructor or function parameters. |

For migrated modules, forbid inward code from importing Fastify, concrete repositories, Drizzle schema or row types, SDK clients, job runners, or the composition container. Apply the rule to type-only imports and path aliases as well as runtime imports. Cross-feature calls use deliberate application contracts or a facade. Put reusable business semantics with their owner and expose an interface when a caller needs a real boundary. A small read can use a use-case-shaped query contract and one SQL projection. Classes, duplicate DTOs, generic repositories, and empty layers are optional design choices. [Onion Architecture follow-up][onion-4] · [Ports and Adapters][ports] · [Service Layer][service-layer]

## Tool-specific guidance to include

| Tools used | Guidance for DevDigest | Sources |
| --- | --- | --- |
| Fastify 5, Zod 3, and `fastify-type-provider-zod` 4 | Keep route registration under `modules/<feature>/routes.ts`. Resolve trusted context through the existing auth adapter. Validate request shape and define responses at the route edge, then map to use-case input. Put checks against stored state in the use case or its authorized data path. Translate domain outcomes through the existing error envelope and preserve validation status codes. Use provider examples compatible with Zod 3. | [Fastify plugins][fastify-plugins] · [Encapsulation][fastify-encapsulation] · [Validation and serialization][fastify-validation] · [Provider compatibility][zod-provider] · [Zod v3][zod-v3] |
| Drizzle ORM, Postgres.js, PostgreSQL 16, and pgvector | Keep queries, schema objects, migrations, indexes, vector operators, and row mapping in persistence adapters. Put atomicity behind a use-case-shaped write or a narrowly scoped transaction port. Keep applicable constraints in PostgreSQL and cover workspace scoping and concurrent writes with real database tests. For summaries or retrieval, let SQL do the set-based work and verify the business selection through the adapter contract. | [Drizzle transactions][drizzle-transactions] · [Drizzle migrations][drizzle-migrations] · [Postgres.js][postgres-js] · [PostgreSQL constraints][pg-constraints] · [pgvector][pgvector] |
| Octokit, simple-git, OpenAI and Anthropic SDKs, and reviewer-core | Use the existing GitHub, Git, and model contracts at the application boundary. Keep credential lookup, SDK-specific shapes, and transport failures in adapters. Keep review strategy, scoring, and grounding with their existing owners. The engine receives the model client, while the API owns Git, persistence, and run lifecycle. | [Octokit][octokit] · [simple-git][simple-git] · [OpenAI Node SDK][openai] · [Anthropic TypeScript SDK][anthropic] · [Reviewer-core instructions](../reviewer-core/AGENTS.md) |
| PQueue, background jobs and SSE, ast-grep, ripgrep, dependency-cruiser, and Graphology | Adapt scheduling, progress publication, tool execution, and graph operations at the edge. Keep semantic rules for retries, cancellation, and ranking with the owning use case or domain. Consume repo-intel through its facade. The proposed architecture check will have its own dependency-cruiser config for DevDigest source. The indexing adapter uses that library for imported repositories. | [PQueue][p-queue] · [ast-grep Node API][ast-grep] · [ripgrep][ripgrep] · [Graphology][graphology] · [Repo-intel pipeline and facade](../server/src/modules/repo-intel/README.md) |
| TypeScript, Vitest, Fastify injection, and Testcontainers | Resolve imports with the server TypeScript configuration. Test policies and use cases with injected doubles, test HTTP status and DTO mapping through `app.inject()`, and exercise transactions, workspace isolation, and vector queries against the existing PostgreSQL integration setup when affected. | [TypeScript modules reference][ts-modules] · [Vitest mocking][vitest-mocking] · [Fastify testing][fastify-testing] · [Testcontainers PostgreSQL][testcontainers] · [DevDigest testing strategy](../TESTING.md) |

## Skill package and rollout

1. **Write the skill.** Create the shared `SKILL.md` and Codex entry using the repository's skill layout. Put dependency rules, layer decisions, the smallest viable workflow, and verification directly in the skill. Add a worked agent-update example and keep detailed tool recipes and links in references. Link to existing Fastify, Drizzle, Zod, PostgreSQL, and security skills when the task needs those specifics.
2. **Prove the architecture in one workflow.** Use agent updates and configuration versioning as the pilot. Keep the real route and response contract. Separate the versioning decision from storage, inject an operation-specific dependency, and preserve workspace scope and consistency of the agent and version writes. Add the tests that distinguish the new boundary from the current design.
3. **Make dependency rules executable.** Reuse the server's existing dependency-cruiser release. Run a dedicated check on backend source with the server TypeScript config and pre-compilation dependency detection so aliases and type-only imports are visible. Check outward imports, private cross-feature imports, and cycles in the enforced scope. Prove that a legal composition import passes and that an outward dependency fails through both relative and alias paths. Start with the pilot in CI, then extend the gate to new and migrated modules. If the initial audit calls for a baseline, track specific existing violations and fail on new ones. [Rules reference][dep-rules] · [TypeScript and alias options][dep-options] · [CLI and baselines][dep-cli]
4. **Expand by use case.** Move to review orchestration after the pilot works. Use the run lifecycle spec to check cancellation, partial failure, durable state, and SSE behavior. Carry the same inward dependency rule into additional modules as they change. Run DB-free checks for import rules and use cases and PostgreSQL integration tests for changed persistence behavior. [Review lifecycle](../server/specs/review-runs.md) · [Testing strategy](../TESTING.md)

The initial skill and pilot are complete when the use case can run without Fastify, PostgreSQL, or network access, the route and database integration tests preserve the observable contract, and CI rejects a demonstrated architecture violation. The dependency check covers static imports. Behavior tests verify properties such as workspace scope and transaction consistency.

## Architecture reading

- Palermo introduces the inward dependency rule in part 1, shows interface implementation and composition in part 2, explains infrastructure isolation and testability in part 3, and reflects on practical application in part 4. [Part 1][onion-1] · [Part 2][onion-2] · [Part 3][onion-3] · [Part 4][onion-4]
- Cockburn illustrates replacing a port's database or UI adapter for independent testing. Stafford describes a service boundary that coordinates application operations and transactions. [Ports and Adapters][ports] · [Service Layer][service-layer]

[onion-1]: https://jeffreypalermo.com/2008/07/the-onion-architecture-part-1/
[onion-2]: https://jeffreypalermo.com/2008/07/the-onion-architecture-part-2/
[onion-3]: https://jeffreypalermo.com/2008/08/the-onion-architecture-part-3/
[onion-4]: https://jeffreypalermo.com/2013/08/onion-architecture-part-4-after-four-years/
[ports]: https://alistair.cockburn.us/hexagonal-architecture
[service-layer]: https://martinfowler.com/eaaCatalog/serviceLayer.html
[fastify-plugins]: https://fastify.dev/docs/v5.7.x/Reference/Plugins/
[fastify-encapsulation]: https://fastify.dev/docs/v5.7.x/Reference/Encapsulation/
[fastify-validation]: https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/
[fastify-testing]: https://fastify.dev/docs/v5.7.x/Guides/Testing/
[zod-provider]: https://github.com/turkerdev/fastify-type-provider-zod
[zod-v3]: https://github.com/colinhacks/zod/blob/v3.25.76/packages/zod/README.md
[drizzle-transactions]: https://orm.drizzle.team/docs/transactions
[drizzle-migrations]: https://orm.drizzle.team/docs/migrations
[postgres-js]: https://github.com/porsager/postgres
[pg-constraints]: https://www.postgresql.org/docs/16/ddl-constraints.html
[pgvector]: https://github.com/pgvector/pgvector
[octokit]: https://github.com/octokit/octokit.js
[simple-git]: https://github.com/steveukx/git-js
[openai]: https://github.com/openai/openai-node
[anthropic]: https://github.com/anthropics/anthropic-sdk-typescript
[p-queue]: https://github.com/sindresorhus/p-queue
[ast-grep]: https://ast-grep.github.io/guide/api-usage/js-api.html
[ripgrep]: https://github.com/BurntSushi/ripgrep
[graphology]: https://graphology.github.io/
[ts-modules]: https://www.typescriptlang.org/docs/handbook/modules/reference.html
[vitest-mocking]: https://vitest.dev/guide/mocking
[testcontainers]: https://node.testcontainers.org/modules/postgresql/
[dep-rules]: https://github.com/sverweij/dependency-cruiser/blob/v17.4.3/doc/rules-reference.md
[dep-options]: https://github.com/sverweij/dependency-cruiser/blob/v17.4.3/doc/options-reference.md
[dep-cli]: https://github.com/sverweij/dependency-cruiser/blob/v17.4.3/doc/cli.md
