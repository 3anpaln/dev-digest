---
name: onion-architecture
description: Design or refactor DevDigest backend modules with inward dependencies, application-owned ports, and isolated infrastructure. Use when adding use cases, moving business rules, wiring adapters, or enforcing backend import boundaries.
metadata:
  version: "1.0.0"
---

# Onion Architecture

Read [backend instructions](../../../server/AGENTS.md) and trace the existing entry point, use case, side effects, and tests. Keep source dependencies pointing toward business policy. Assign each new dependency to the innermost layer that owns the concept. An outer adapter implements the port that the use case needs. The composition root supplies the implementation.

## Dependency rules

| Layer | Owns | May depend on |
| --- | --- | --- |
| Domain | Business rules, calculations, invariants, and state transitions | Its own domain and approved portable domain types |
| Application | Use-case orchestration, inputs and outcomes, outbound ports, and the unit of work required by a use case | Its domain, its own ports, and explicit public application contracts |
| Inbound adapters | Fastify routes and background job handlers that translate input, context, and outcomes | The public use cases they invoke and their transport or runtime tooling |
| Outbound adapters | SQL, storage mapping, external SDK calls, tool execution, and event delivery | The ports and domain types they implement or map, and infrastructure libraries |
| Composition | Construction, configuration, and concrete dependency wiring | The use cases and adapters it assembles |

The domain and application layers stay independent of Fastify requests and replies, transport validators, Drizzle schema and row types, provider SDKs, and the dependency container. Type-only imports count as design dependencies. Pass narrow functions or interfaces through constructors or parameters. A small use case can fit in one module with its port. Split files when the behavior or ownership warrants it.

## Apply the rules in DevDigest

1. **Find the boundary.** Keep the Fastify entry point at `server/src/modules/<feature>/routes.ts` and register new features in the existing registry. Validate request shape there and get workspace and actor context from the auth adapter. Pass explicit inputs to the use case and map its outcome through the existing API error and response conventions.
2. **Place the policy and I/O.** Keep what the product decides in domain or application code. Keep how it is stored, published, or sent in adapters. Pass capabilities through operation-specific ports. Keep transaction requirements explicit, let the adapter enforce atomicity, and preserve workspace scope at persistence boundaries. A SQL projection can perform set-based work behind an application contract that states the selection rule.
3. **Wire and verify.** Use the existing app and [container](../../../server/src/platform/container.ts) to assemble concrete dependencies. Cross-feature callers use a public use case or facade. For legacy modules, tighten the slice being changed and preserve existing contracts. Check imports and test the use case with injected doubles. Exercise affected HTTP behavior through `app.inject()` and use the PostgreSQL suite for changed persistence behavior.

## References

- [Tool boundaries](references/tool-boundaries.md) maps the rules to Fastify, Zod, Drizzle, PostgreSQL, SDKs, reviewer-core, and background jobs.
- [Dependency checks](references/dependency-checks.md) covers making these rules executable for a module or rollout.
- [Agent update example](references/agent-update-example.md) shows how to split a real use case and what to verify at each boundary.
- [Architecture plan and sources](../../../docs/onion-architecture-skill-plan.md) records the original Onion Architecture articles, project findings, and tool documentation.
