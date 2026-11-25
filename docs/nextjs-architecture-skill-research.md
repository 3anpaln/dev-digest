# Research for a Next.js 15 architecture skill

These notes extend the [React and front-end research](react-frontend-skill-research.md) on component design, state, constants, helpers, and business logic. They capture the Next.js decisions needed for the future README and skill. Research verified on 2026-11-25 against the Next.js 15 App Router documentation, its upgrade guides, and the repository.

## DevDigest architecture

DevDigest uses Next.js 15.5, React 19, and TanStack Query 5. Next.js provides the web studio and App Router. Browser queries and mutations use the existing typed API client and query hooks to call a separate Fastify service. Fastify owns the API, workspace authorization, and durable business operations. The root Next.js layout supplies metadata, localization, and the provider boundary, and route-specific UI lives under the route's `_components/`. [Client dependencies](../client/package.json) · [Repository architecture](../README.md#architecture) · [Client instructions](../client/AGENTS.md) · [Client provider setup](../client/src/lib/providers.tsx) · [Root layout](../client/src/app/layout.tsx)

A PR makes the boundaries concrete. The browser URL addresses the PR by GitHub number, the client resolves its internal ID, and queries to the Fastify API use that ID. The tab and open trace are URL state. Cached reviews are query state. A popover's open and closed states are local interaction state. The rule for which agent runs contribute to the listing lives behind the API. [PR detail spec](../client/specs/pr-detail.md) · [Finding previews spec](../specs/pr-finding-previews.md) · [Query hooks](../client/src/lib/hooks/core.ts)

## Skills and when to use them

| Skill | When it belongs in the workflow | What it contributes |
| --- | --- | --- |
| [Next.js best practices](../.claude/skills/next-best-practices/SKILL.md) | Adding or reviewing an App Router route, boundary, server fetch, mutation, deployment behavior, or build problem | Versioned file conventions, rendering, navigation, caching, and runtime |
| [React best practices](../.claude/skills/react-best-practices/SKILL.md) | Designing or refactoring components, hooks, state, or rendering behavior | Component ownership, composition, state and effects, and extraction decisions |
| [React Testing Library](../.agents/skills/react-testing-library/SKILL.md) | Changing behavior covered by component tests | Semantic queries, user interactions, and async assertions |
| [UI/UX](../.agents/skills/ui-ux-pro-max/SKILL.md) or [UI styling](../.agents/skills/ui-styling/SKILL.md) | Changing a visual or interaction pattern, accessibility behavior, or shared UI | Interaction and visual conventions appropriate to the existing design |
| [Fastify best practices](../.agents/skills/fastify-best-practices/SKILL.md), [Zod](../.agents/skills/zod/SKILL.md), or [security](../.agents/skills/security/SKILL.md) | Changing the Fastify entry point, transport schema, auth, or data exposure | API ownership, validation, and trust boundaries |
| [TypeScript expert](../.agents/skills/typescript-expert/SKILL.md) | Working on advanced types, module boundaries, compiler configuration, or migration tooling | Type and build-system reasoning beyond routine component work |

The future skill should open with ownership and runtime decisions, link to the React research for component design, and route to secondary skills when the affected surface warrants them. Retain the existing Next.js skill's useful topical references. Add version labels to framework-dependent advice so the future skill can reuse those references selectively.

## Routing and component boundaries

- **Organize around the product route and the owner of the behavior.** Keep `page.tsx` as the URL entry point and `layout.tsx` for chrome or state that should persist across child routes. Use regular components for feature-specific UI and reserve special files for the behavior Next.js attaches to them. Colocation is supported inside `app/`, and an underscore opt-out is available. Route groups organize routes and layout scope without adding URL segments. [Project structure][structure] · [Layouts][layout]
- **Use server components where the work can stay on the server.** App Router pages and layouts default to Server Components. Mark the smallest practical interactive entry with `'use client'` for state, browser APIs, or event handlers. The directive also pulls imported modules into the client module graph, so keep secrets and privileged dependencies in server modules. Pass data React can serialize across the boundary. Server-rendered UI can be passed into a client wrapper as `children` or another prop. Ordinary Server Components need no `'use server'` directive. That directive declares Server Functions. [Server and Client Components][rsc] · [Updating Data][update]
- **Keep request-dependent URL reads current.** On Next.js 15, await the server `params` and page `searchParams` props and request APIs such as `cookies()` and `headers()`. For a client view reacting to navigation, use the App Router hooks from `next/navigation`. Shared layouts can persist through navigation, so put search parameter reads in the page or a client child. On a statically rendered route, wrap the smallest `useSearchParams()` subtree in Suspense and verify the production build. [Next.js 15 upgrade guide][upgrade15] · [Layouts][layout] · [useSearchParams][search] · [Missing Suspense boundary][missing-suspense]
- **Make navigation and loading boundaries intentional.** Use `Link` for ordinary internal links and programmatic navigation when a workflow needs it. A route `loading.tsx` supplies a segment fallback below its layout. Use a nearer Suspense boundary when only part of the UI needs to wait. Choose a boundary that keeps surrounding UI usable and exercise direct loads, reloads, and client-side transitions for deep links. [Linking and navigating][navigate] · [Loading][loading]

## Reads, writes, and business-rule ownership

| Need | Usual owner | When the choice fits |
| --- | --- | --- |
| Initial server-rendered data | Server Component calling its data-access function or established HTTP API | Data is needed to render the route or requires server-only credentials |
| Browser-controlled or frequently updated data | Existing TanStack Query hook | Polling, cursor-driven requests, client interactions, or query invalidation drive freshness |
| Next.js-owned browser mutation | Server Action, when its form or mutation integration fits | The application wants server execution integrated with its own React workflow |
| An HTTP endpoint | Existing Fastify route, or a Next.js Route Handler for a specific front-end boundary | A consumer needs an explicit HTTP contract, a webhook, callback, or a documented browser-facing proxy |
| Authorization and durable product rules | The service that owns the data and operation | Every entry point needs the same trusted decision |

For DevDigest work, start with the existing Fastify endpoint and typed client. Add a Next.js HTTP adapter only when it has a clear job such as a same-origin integration. A Server Component can call an existing external API directly. Calling a Route Handler in the same Next.js app adds a round trip at runtime and can fail during build-time prerendering. Server Actions and Route Handlers have public-facing entry points, so validate inputs and enforce authorization at the relevant boundary. Middleware can make an early routing decision. The final resource and action checks belong close to data access. [Backend for Frontend][bff] · [Route Handlers][route] · [Authentication][auth] · [Data security][security] · [Updating Data][update]

Start independent requests together when they are needed by the page. Keep real dependencies sequential, such as resolving a PR ID before loading its reviews. A boundary around a slower section can let the rest of the route render first. For an ordinary form rejection, return actionable information to the form. Use `notFound()` for a missing route resource when appropriate, segment `error.tsx` for unexpected rendering failures, and explicit query or mutation error handling for asynchronous UI operations. [Fetching Data][fetching] · [Error Handling][errors] · [Loading][loading]

## Caching and freshness in Next.js 15

| Mechanism | What it owns | What to verify |
| --- | --- | --- |
| Request memoization | Repeat reads within one server render | Matching eligible fetches can share work during the render. This is separate from cache persistence across requests. Route Handlers sit outside the React render tree. |
| Next.js Data Cache | Server-fetched data across requests when configured to cache | Choose explicit freshness for data that should be reusable. Review the invalidation rule and any user or workspace scope. |
| Full Route Cache | Prerendered HTML and React Server Component payload | Verify whether the route is static or request-rendered separately from whether individual fetches persist. |
| App Router Cache | Route-segment payload in the browser | Check navigation, back and forward, shared layouts, and refresh when diagnosing stale output. |
| TanStack Query | Browser data by query key | Verify scope, stale time, and invalidation after writes. A refresh of the Next.js route is separate from Query invalidation. |

Next.js 15 changed the defaults for persistent server `fetch` caching, `GET` Route Handler caching, and reuse of page segments on normal forward navigation. A route eligible for prerendering can still cache its rendered output. Before adding `force-cache`, time-based revalidation, or path or tag invalidation, decide what may be shared, for how long, and what updates it. Use the tool for the cache that owns the stale value. `router.refresh()` requests a fresh route payload and can still receive cached server data. If server-prefetched and client-refetched data describe the same mutable resource, give the visible result a clear owner so summaries and lists stay in sync. [Next.js 15 upgrade guide][upgrade15] · [Caching guide][cache] · [Caching and Revalidating][revalidate] · [TanStack Query SSR and data ownership][query-ssr] · [Query mutation invalidation][query-invalidation]

## Runtime, assets, and operational verification

- **Keep initialization safe across server and browser renders.** Client Components can contribute initial HTML. Keep the initial render consistent across environments and isolate browser-only initialization. Incompatible browser libraries may need a narrowly scoped client wrapper or client-only dynamic loading. Check the production build and direct page load when hydration or bundling is involved. [Server and Client Components][rsc] · [Hydration errors][hydration] · [Lazy loading][lazy] · [Package bundling][bundling]
- **Keep deployment configuration in its owning runtime.** Next.js uses Node.js by default for server rendering and routes. Choose Edge only when the deployment needs it and the dependencies and features it uses are supported there. The `NEXT_PUBLIC_` API base is browser-visible and can be inlined at build time. Keep credentials behind the API or server boundary. Verify the client API base and its CSP connection allowlist together when deployment configuration changes. [Edge runtime][edge] · [Environment variables][env] · [DevDigest Next.js configuration](../client/next.config.mjs)
- **Use metadata and asset tooling based on the route.** Use static metadata when a title is known and `generateMetadata` when it depends on route data. Descriptive document titles also help Next.js announce navigation. Use `next/image` when its sizing, formats, or lazy loading are useful, with meaningful alt text, appropriate dimensions or `fill` and `sizes`, and narrow remote allowlists. In v15, reserve `priority` for images whose early loading matters, such as the LCP image. `next/font` can self-host fonts. Keep placeholders, preloading, and lazy loading tied to the actual page. [Metadata][metadata] · [Accessibility][accessibility] · [Image API][image] · [Fonts][font]
- **Match tests to what can fail.** Use Vitest for compatible unit and component cases. Use a built application or browser flow for async Server Components, prerender constraints, redirects, metadata, navigation and reload, hydration, streaming, and real layout behavior. Run `next build` for changes that depend on App Router compilation or prerendering, then exercise the relevant route against the expected API. [Vitest with Next.js][vitest] · [Production checklist][production] · [DevDigest testing](../TESTING.md)
- **Use deployment options when the deployment needs them.** A running Next.js server supports streaming when any reverse proxy allows the chunks through. For multi-instance ISR or persistent data caching, check whether the instances share cache state and invalidation. Standalone output includes traced server files and requires serving or copying static assets separately. These considerations apply when a deployment uses the relevant topology. [Self-hosting][self-hosting] · [Standalone output][output]

## Existing Next.js skill audit

| Existing guidance | Treatment for the future skill |
| --- | --- |
| File conventions, async APIs, and server/client boundaries | Keep these as core guidance. Lead with the target Next.js version and the applicable App Router behavior. |
| Suspense for navigation hooks | Distinguish `useSearchParams` on static routes from `usePathname`. The current `usePathname` documentation scopes its possible Suspense requirement to Cache Components and whether the pathname resolves at prerender time. The versioned v15 API instead documents hydration considerations for rewrites. [useSearchParams][search] · [v15 usePathname][pathname15] · [Current usePathname][pathname-current] |
| Middleware, Proxy, and `'use cache'` | Keep `middleware.ts` terminology for v15. The Proxy rename and the `cacheComponents` configuration belong to v16 migration guidance. Document v15 fetch, route, and router-cache behavior first. [Next.js 15 middleware][middleware] · [Next.js 15 upgrade guide][upgrade15] · [Next.js 16 upgrade guide][upgrade16] |
| Image optimization, dynamic imports, and alternate runtimes | Present them as decisions with a concrete need. Confirm the Next.js version, package compatibility, responsive sizing, and deployment before changing a default. [Image API][image] · [Lazy loading][lazy] · [Edge runtime][edge] |
| Parallel routes, intercepting routes, self-hosting, and debug tooling | Keep them as focused references to load for a relevant task. Include a verification step tied to the behavior being changed. [Project structure][structure] · [Self-hosting][self-hosting] · [Production checklist][production] |

The future README can start with a route ownership example, then cover rendering boundaries, data and mutation ownership, cache behavior, and verification. Preserve the React notes as the reference for decisions that apply across frameworks.

## Annotated source list

### Version and routing

- **Next.js 15 upgrade guide** documents the async request API change and the separate changes to fetch, GET handlers, and router cache behavior. **Next.js 16 upgrade guide** identifies the later Proxy rename, removal of synchronous request access, and Cache Components changes. [Version 15][upgrade15] · [Version 16][upgrade16]
- **Project structure, layout, and navigation** explain public route entry points, route groups, private folders, persistent layouts, client transitions, and prefetching. [Project structure][structure] · [Layouts][layout] · [Navigation][navigate]
- **URL hooks and loading** document how static routes handle query parameters and how to scope fallbacks. The two pathname references make the version and configuration difference explicit. [useSearchParams][search] · [Missing Suspense boundary][missing-suspense] · [v15 usePathname][pathname15] · [Current usePathname][pathname-current] · [Loading][loading]

### Rendering, data, and security

- **Server and Client Components** describes what enters the client module graph, which props cross the boundary, and how a client wrapper can receive server-rendered content. [Server and Client Components][rsc]
- **Fetching and updating data** cover request orchestration, streaming, Server Function invocation, and the intended use of actions for mutations. [Fetching Data][fetching] · [Updating Data][update]
- **Backend for Frontend and Route Handlers** distinguish public HTTP boundaries from server rendering and explain the extra same-app HTTP hop. [Backend for Frontend][bff] · [Route Handlers][route]
- **Data security, authentication, and middleware** describe minimizing data exposed to the UI, authorizing each sensitive action, and placing authoritative checks near data access. Middleware runtime support is version-specific. [Data security][security] · [Authentication][auth] · [Middleware][middleware]
- **Caching references** explain server-render memoization, persistent data and route output, navigation caching, and invalidation. TanStack Query covers client-cache ownership and the case where server and client views can diverge on refetch. [Next.js caching][cache] · [Revalidation][revalidate] · [TanStack Query SSR][query-ssr] · [Query mutation invalidation][query-invalidation]
- **Error handling** covers expected application failures, missing resources, nested error boundaries, and asynchronous handlers outside a rendering boundary. [Error Handling][errors]

### Delivery and verification

- **Hydration, lazy loading, and bundling** describe render mismatches, when disabling SSR for one component may fit, and how to measure or configure packaging. [Hydration][hydration] · [Lazy loading][lazy] · [Package bundling][bundling]
- **Environment, runtime, and self-hosting** cover browser-inlined config, Edge API limitations, streaming across a proxy, and multi-instance cache considerations. [Environment variables][env] · [Edge runtime][edge] · [Self-hosting][self-hosting] · [Standalone output][output]
- **Metadata, accessibility, image, and font docs** cover route titles and announcements, responsive image sizing and remote paths, and built-in font hosting. [Metadata][metadata] · [Accessibility][accessibility] · [Image API][image] · [Fonts][font]
- **Vitest and the production checklist** describe the boundary of synchronous component testing and recommend exercising async Server Components end to end. The checklist includes production build and start verification. [Vitest][vitest] · [Production checklist][production]

[upgrade15]: https://nextjs.org/docs/app/guides/upgrading/version-15
[upgrade16]: https://nextjs.org/docs/app/guides/upgrading/version-16
[structure]: https://nextjs.org/docs/15/app/getting-started/project-structure
[layout]: https://nextjs.org/docs/15/app/api-reference/file-conventions/layout
[navigate]: https://nextjs.org/docs/15/app/getting-started/linking-and-navigating
[search]: https://nextjs.org/docs/15/app/api-reference/functions/use-search-params
[missing-suspense]: https://nextjs.org/docs/messages/missing-suspense-with-csr-bailout
[pathname15]: https://nextjs.org/docs/15/app/api-reference/functions/use-pathname
[pathname-current]: https://nextjs.org/docs/app/api-reference/functions/use-pathname
[loading]: https://nextjs.org/docs/15/app/api-reference/file-conventions/loading
[rsc]: https://nextjs.org/docs/15/app/getting-started/server-and-client-components
[fetching]: https://nextjs.org/docs/15/app/getting-started/fetching-data
[update]: https://nextjs.org/docs/15/app/getting-started/updating-data
[bff]: https://nextjs.org/docs/15/app/guides/backend-for-frontend
[route]: https://nextjs.org/docs/15/app/api-reference/file-conventions/route
[security]: https://nextjs.org/docs/15/app/guides/data-security
[auth]: https://nextjs.org/docs/15/app/guides/authentication
[middleware]: https://nextjs.org/docs/15/app/api-reference/file-conventions/middleware
[cache]: https://nextjs.org/docs/15/app/guides/caching
[revalidate]: https://nextjs.org/docs/15/app/getting-started/caching-and-revalidating
[query-ssr]: https://tanstack.com/query/latest/docs/framework/react/guides/advanced-ssr
[query-invalidation]: https://tanstack.com/query/latest/docs/framework/react/guides/invalidations-from-mutations
[errors]: https://nextjs.org/docs/15/app/getting-started/error-handling
[hydration]: https://nextjs.org/docs/messages/react-hydration-error
[lazy]: https://nextjs.org/docs/15/app/guides/lazy-loading
[bundling]: https://nextjs.org/docs/15/app/guides/package-bundling
[env]: https://nextjs.org/docs/15/app/guides/environment-variables
[edge]: https://nextjs.org/docs/15/app/api-reference/edge
[self-hosting]: https://nextjs.org/docs/15/app/guides/self-hosting
[output]: https://nextjs.org/docs/15/app/api-reference/config/next-config-js/output
[metadata]: https://nextjs.org/docs/15/app/getting-started/metadata-and-og-images
[accessibility]: https://nextjs.org/docs/15/architecture/accessibility
[image]: https://nextjs.org/docs/15/app/api-reference/components/image
[font]: https://nextjs.org/docs/15/app/getting-started/fonts
[vitest]: https://nextjs.org/docs/15/app/guides/testing/vitest
[production]: https://nextjs.org/docs/15/app/guides/production-checklist
