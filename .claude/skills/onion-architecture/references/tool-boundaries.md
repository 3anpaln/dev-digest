# DevDigest tool boundaries

## Fastify 5 and Zod 3

Keep route plugins and schemas at the HTTP boundary. Reuse the registered validator, serializer, and error handler. Map the validated wire shape into explicit use-case parameters. Obtain workspace and actor identity from the auth adapter. Pass that context through to the operations and queries that use it. Keep checks against persisted state out of request schema validation. Decide whether to allow the operation in the use case and enforce the relevant scope in persistence. Map domain outcomes to the existing status codes and response envelope. Use the Zod 3 API supported by the installed `fastify-type-provider-zod` 4. [Request and dependency flow](../../../../server/README.md#request--di-flow) · [Fastify validation and serialization](https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/) · [Provider compatibility](https://github.com/turkerdev/fastify-type-provider-zod)

Shared transport schemas belong at the transport boundary. Reuse existing platform-neutral shared types where their semantics match. Before adding a new shared API shape, verify both vendored contract copies. Preserve established validation boundaries inside reviewer-core, such as structured model output validation, independently of HTTP validation. [Cross-package insights](../../../../insights.md) · [Reviewer-core instructions](../../../../reviewer-core/AGENTS.md)

## Drizzle, PostgreSQL, and pgvector

Keep Drizzle predicates, inferred row types, migrations, driver errors, and vector operations in the persistence adapter. Map rows to the application shape at that boundary. Specify the transaction guarantee the use case needs. Prefer a narrow atomic operation when the caller needs one write guarantee. If a decision must happen between a protected read and write, use a scoped transaction port or an equivalent concurrency control contract. Apply workspace restrictions in the relevant predicates. Use PostgreSQL constraints or conditional updates for invariants where concurrent callers could otherwise race. Preserve the effect of retries, partial failures, and rollbacks. [Drizzle transactions](https://orm.drizzle.team/docs/transactions) · [PostgreSQL constraints](https://www.postgresql.org/docs/16/ddl-constraints.html)

Define which results an application read expects in its port. A query adapter can implement that definition in SQL using grouping, ranking, or vector search to avoid materializing records the caller does not need. Verify results against representative PostgreSQL or pgvector data. [pgvector](https://github.com/pgvector/pgvector) · [Testing strategy](../../../../TESTING.md)

## Provider clients, jobs, and indexing

- Reuse the existing Git, GitHub, LLM, and other adapter contracts where they fit. Keep credentials, provider request and response formats, shell invocation, and transport error mapping at the edge. Keep review strategy, scoring, and grounding with reviewer-core. The API owns run and review persistence, and the caller supplies the model client. [Container and adapters](../../../../server/src/platform/container.ts) · [Reviewer-core instructions](../../../../reviewer-core/AGENTS.md)
- Keep job and SSE entry points responsible for accepting work and delivering progress. Put lifecycle decisions such as when a cancelled run may proceed or how partial failure affects other agents in the owning application code. Preserve the meaning and timing of completion events and the atomicity of accepted writes. [Review run lifecycle](../../../../server/specs/review-runs.md)
- Use the repo-intel facade for repository context. Keep clone and index work in background jobs, with AST, graph, and process details behind the existing adapters. [Repo-intel pipeline and facade](../../../../server/src/modules/repo-intel/README.md)

For implementation details, see the existing [Fastify](../../fastify-best-practices/SKILL.md), [Drizzle](../../drizzle-orm-patterns/SKILL.md), [Zod](../../zod/SKILL.md), and [PostgreSQL](../../postgresql-table-design/SKILL.md) guides. The [architecture plan](../../../../docs/onion-architecture-skill-plan.md) contains the SDK and tool source links.
