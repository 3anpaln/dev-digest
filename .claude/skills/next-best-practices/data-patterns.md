# App Router data patterns

Find the current data owner and check the Next.js version before changing data access. In DevDigest, Fastify owns the API and the existing TanStack Query hooks handle browser reads and writes.

| Need | Choice |
| --- | --- |
| Initial route rendering or server-only access | Read from the source in a Server Component or server data-access function. An existing external HTTP API can be that source. |
| Browser-driven filters, polling, or cache invalidation | Use the existing TanStack Query hook or add a feature-owned query. |
| A mutation owned by Next.js that benefits from its form lifecycle | Use a Server Action. Validate arguments, authorize the operation, and return expected errors to the UI. |
| A consumer needs an HTTP contract such as a webhook or a browser-facing adapter | Use the existing API service or a Route Handler for a defined front-end role. |

Calling a Route Handler in the same application from a Server Component adds an HTTP hop at runtime and can fail when the page prerenders at build time. Treat route handlers and server actions as entry points whose callers must be authenticated and authorized where required. Keep durable rules with the service that owns the data.

## Fetch when the inputs are ready

Start independent requests together. When one request needs an ID or other result from a prior step, preserve that dependency. Use a Suspense boundary when only a portion of the route should wait. Keep fresh server data in one visible owner if the same resource is initially server-prefetched and later refetched in the client. The [TanStack Query skill](../tanstack-query-best-practices/SKILL.md) covers browser cache behavior.

## Caching in Next.js 15

- **Request memoization** can deduplicate matching eligible fetches in one React server render. It does not persist across requests and Route Handlers are outside that render tree.
- **Data Cache** can persist eligible server reads when configured. Fetch requests and GET Route Handlers are uncached by default in v15. Choose explicit caching when the resource, user scope, and invalidation policy allow it.
- **Full Route Cache** stores eligible prerendered output. Check this separately from fetch persistence.
- **Router Cache** stores route payloads in the browser. `router.refresh()` requests the current route again and may still receive cached server data.
- **TanStack Query** stores browser API results by query key. Invalidate the affected keys when a write or background event makes their data stale.

See [Next.js 15 caching](https://nextjs.org/docs/15/app/guides/caching), [Next.js 15 upgrade guide](https://nextjs.org/docs/app/guides/upgrading/version-15), and [Backend for Frontend](https://nextjs.org/docs/15/app/guides/backend-for-frontend).
