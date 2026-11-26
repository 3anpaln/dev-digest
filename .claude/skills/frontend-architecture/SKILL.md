---
name: frontend-architecture
description: Decide where frontend components, constants, helpers, hooks, and business rules belong and when to split or share them. Use when designing a feature or refactoring frontend module boundaries.
metadata:
  version: "1.0.0"
---

# Frontend Architecture

Read the nearest repository instructions and inspect the feature's route, current consumers, and tests. Identify the owner and runtime for each responsibility before moving code. Preserve existing public behavior, data and cache identities, and browser interaction unless the task changes them.

## Decide where code belongs

| Responsibility | Start here | Move it when |
| --- | --- | --- |
| Small private UI | Same file, declared at module scope | A sibling file makes a distinct UI or interaction easier to understand or test |
| Route-specific UI and behavior | The route's local component folder | Multiple routes consume the same feature contract |
| Shared feature UI or logic | The owning feature's module | The implementation has a stable, domain-independent contract |
| Generic UI | The existing shared UI kit | Add a primitive when real consumers need shared semantics the kit cannot express |
| Pure calculation or transformation | Inline if obvious, or a named function near the caller | A reusable contract, meaningful edge cases, or a useful name justifies the boundary |
| React-dependent behavior | Component state and handlers, or a focused hook | A hook can express a coherent interaction, subscription, or lifecycle |
| Product rule | A feature or domain function with explicit inputs | The authoritative service needs to enforce it across consumers or coordinate a durable operation |

Split a component where a name identifies a responsibility, a child owns a cohesive interaction, or independently changing parts keep obscuring each other. Keep closely related markup and behavior visible together. Treat prop count and file size as signals to inspect coupling. Add a public entry point where an outside caller needs a stable feature interface.

Keep a static presentation value private to the component that owns it. Give shared feature values a module named for their purpose, such as severity ordering. Keep labels in the message catalog, reusable visual values in design tokens, deployment settings in configuration, and protocol values or thresholds with their authoritative contracts or policies. Derive values that depend on props, state, or locale at the point where those inputs are available.

## Apply to DevDigest

- Keep route-private UI in the App Router segment's `_components/`. Use the existing shared UI kit for domain-independent controls and the existing API client and query hooks under `client/src/lib/`.
- Keep display rules such as grouping already-fetched findings in the client feature. Keep workspace authorization, selection policies shared by API consumers, and persistent writes on the Fastify side. A client can show an action as unavailable using the API's representation, and the server still authorizes the request.
- Resolve the GitHub PR number to the internal PR ID before requesting review data. Keep shareable tab or trace selection in the URL, review results in the query cache, and popover visibility in the local component.

For a PR findings preview, the PR row can compose the trigger, a private component can render the items, a named feature helper can group them if several views use the same display rule, and the existing query layer can load details. Keep the latest-run policy with the API that supplies the list and the detail results.

## Verify the boundary

Exercise the normal route, including loading, empty, error, and populated states that the change affects. Check props and keys around moved state, keyboard and focus behavior around extracted UI, and the original and new consumers when promoting a module. Test consequential pure rules directly and interaction through rendered behavior. For browser-dependent layout or scrolling, reproduce the interaction in a browser with data that actually overflows.

- Read [React best practices](../react-best-practices/SKILL.md) for component identity, state, effects, and render correctness.
- Read [Next.js best practices](../next-best-practices/SKILL.md) for route files, runtime boundaries, or build behavior.
- Read [TanStack Query best practices](../tanstack-query-best-practices/SKILL.md) when the change affects a query, mutation, or browser cache.
- See the [frontend skills README](../../../docs/frontend-skills/README.md) for source notes and rationale.
