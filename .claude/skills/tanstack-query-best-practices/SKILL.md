---
name: tanstack-query-best-practices
description: Implement or review TanStack Query v5 reads, mutations, query keys, polling, and cache invalidation. Use when frontend API data is stale, mis-scoped, or refetched incorrectly.
metadata:
  version: "1.0.0"
---

# TanStack Query Best Practices

Trace the request, its cache key, the subscribers, and the events that can change its results. In DevDigest, reuse the typed API client in `client/src/lib/api.ts`, domain hooks in `client/src/lib/hooks/`, and the provider defaults in `client/src/lib/providers.tsx`. Fastify remains the source of truth.

## Read and display data

- Use the existing query key for an existing resource. Include changing request inputs that identify the result, such as internal PR ID, filters, and page. Include user or workspace scope when results vary by it and can coexist in one cache. Keep credentials out of keys. Reuse a typed query definition when several callers need the same key and fetch function.
- Enable a dependent read only after its inputs exist. In DevDigest, map the URL's GitHub PR number to an internal ID before enabling PR queries. In v5, a disabled query without data can be pending with an idle fetch status. Use the first-load state for a loading indicator and distinguish it from background fetching with data. Keep usable data visible during a background refresh and surface errors at the appropriate UI boundary.
- Use `staleTime` to control freshness and `gcTime` to control how long unused entries are retained. Polling uses `refetchInterval` independently of freshness. Start polling when the work can change and return `false` when it ends, unless another live result still needs refresh. Check which event can start or restart the query after navigation.
- Pass the query's abort signal through to the HTTP request when cancellation is required. Inspect the actual API helper signature and preserve cancellation through its error handling. Cancelling a browser read and cancelling a server-side review job use different mechanisms.

## Reconcile writes and live updates

1. List the representations affected by the write, including list aggregates, detail queries, and active run state. Invalidate the scoped keys from the mutation or completion event that establishes when fresh data is available. Use an exact key when one cache entry should change and a prefix when its descendants should also refresh. Await invalidation when the UI must remain pending until the active data is refreshed.
2. When a write returns the authoritative data for a specific cached shape, update that entry immutably and reconcile related views separately. Use optimistic state when it helps the interaction and can be reconciled on failure. For optimistic cache writes, account for in-flight refetches, rollback, and overlapping mutations.
3. Treat a review-start response as confirmation that work was queued or started. For any live review flow, check what invalidates or polls each affected key once progress changes, including a fast completion, a reload during a run, and a terminal failure or cancellation. A Next.js route refresh and TanStack Query invalidation act on different caches.

When introducing server prefetch and hydration, use compatible query keys and options across the boundary. Keep any server-side query cache request-scoped and make ownership of independently changing values explicit. If the interactive client owns a refetchable result, derive its displayed totals and rows from that same result.

## Verify the behavior

Use an isolated QueryClient in component or hook tests and stub the network boundary. Disable test retries when testing an error unless retry behavior is the subject. For a stale result, prove the write, SSE event, or polling transition updates a mounted view and that an unrelated PR or filter remains isolated. For a lazy read, verify that its request starts only when the feature opens.

Use the [frontend skills README](../../../docs/frontend-skills/README.md) for TanStack Query v5 sources. Read [Next.js best practices](../next-best-practices/SKILL.md) when prerendering, server data caching, or hydration is part of the change.
