---
name: next-best-practices
description: Implement or review Next.js App Router routes, Server and Client Component boundaries, navigation, rendering, caching, metadata, and Route Handlers.
user-invocable: false
metadata:
  version: "1.0.0"
---

# Next.js Best Practices

Read the package instructions and check the installed Next.js major version before applying a framework rule. DevDigest uses Next.js 15.5, React 19, and an external Fastify API. Use the App Router references for the installed version.

## Decide the route and runtime

- Use the route segment's special files for routing, layout, loading, and error boundaries. Keep route-local implementation under `_components/` in DevDigest. Shared layouts persist across client navigation, so put reactive URL reads in a page or a client child.
- Keep pages and layouts as Server Components when their work can stay on the server. Put `'use client'` at the narrow interactive entry point. Check its transitive imports and the React-serializable data it receives. Mark privileged modules as server-only when they could be imported into client code.
- In Next.js 15, await server `params`, page `searchParams`, and request APIs such as `cookies()` and `headers()`. For a statically rendered route, put `useSearchParams()` beneath a nearby Suspense boundary and verify the production build. Check the actual rendering configuration before applying a navigation-hook rule.
- Use Node.js for server rendering and routes by default. Check dependency compatibility when a specific deployment needs Edge. In v15 use `middleware.ts` when middleware is needed. The Proxy rename and Cache Components configuration belong to v16 migration work.

## Decide how data enters and changes

- In DevDigest, use the established Fastify endpoints and client hooks for studio reads and writes. For server-rendered reads, call the appropriate data source or external API directly. Add a Next.js Route Handler when the frontend needs an HTTP adapter with its own purpose. A Server Action fits a Next.js-owned mutation that benefits from the React form or mutation lifecycle.
- Keep authorization and durable business rules with the backend operation that owns the data. Validate and authorize at every sensitive entry point. Keep credentials on the server and pass only the data needed for the view.
- Distinguish per-render memoization, the Data Cache, cached route output, the browser Router Cache, and the TanStack Query cache. Next.js 15 does not persistently cache fetches or cache GET Route Handlers by default. A route can still be prerendered. Decide what may be shared, its freshness, and how writes invalidate it before changing caching.

## Verify the route

Use a production build when changing server/client boundaries, prerendering, metadata, or navigation hooks. Exercise a direct URL, reload, and client navigation where those paths can behave differently. Use browser or end-to-end coverage for async Server Components and layout-sensitive behavior. Confirm which layer handles expected application failures and unexpected rendering errors.

## References to open when needed

- Route structure and navigation: [file conventions](file-conventions.md), [functions](functions.md), [Suspense boundaries](suspense-boundaries.md), and [parallel and intercepting routes](parallel-routes.md).
- Rendering and server APIs: [component boundaries](rsc-boundaries.md), [async request APIs](async-patterns.md), [directives](directives.md), and [runtime selection](runtime-selection.md).
- Data and failure handling: [data patterns](data-patterns.md), [route handlers](route-handlers.md), [error handling](error-handling.md), and [TanStack Query best practices](../tanstack-query-best-practices/SKILL.md) for the browser cache.
- Metadata and performance: [metadata](metadata.md), [images](image.md), [fonts](font.md), [bundling](bundling.md), and [scripts](scripts.md).
- Runtime verification: [hydration errors](hydration-error.md), [self-hosting](self-hosting.md), and [debugging](debug-tricks.md).
- Code placement and source material: [Frontend architecture](../frontend-architecture/SKILL.md) and the [frontend skills README](../../../docs/frontend-skills/README.md).

