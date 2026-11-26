# DevDigest frontend skills

These skills guide changes to the Next.js 15 App Router studio, React 19 components, and TanStack Query v5 client. DevDigest uses a separate Fastify API for authorization and durable product rules. Read the guide that owns the decision and open related references when the work crosses a boundary.

| Skill | Version | Use it for |
| --- | --- | --- |
| [Frontend architecture](../../.claude/skills/frontend-architecture/SKILL.md) | 1.0.0 | Feature boundaries, component placement and decomposition, constants, helpers, hooks, and business-rule ownership |
| [React best practices](../../.claude/skills/react-best-practices/SKILL.md) | 1.0.0 | Rendering, component identity, state, effects, and React-dependent behavior |
| [Next.js best practices](../../.claude/skills/next-best-practices/SKILL.md) | 1.0.0 | App Router files, server and client boundaries, navigation, caching, and production verification |
| [TanStack Query best practices](../../.claude/skills/tanstack-query-best-practices/SKILL.md) | 1.0.0 | Browser fetches, cache keys, polling, mutations, invalidation, and query tests |

The `.agents/skills/` entries expose the same guides to Codex. The shared `SKILL.md` files contain the working instructions. Keep version metadata in sync with the entries and this index when revising a skill.

## Worked scenarios

- **PR findings preview.** Place route-specific UI beside the PR list. Keep hover and keyboard state local, fetch full findings through the existing query layer when needed, and keep latest-run selection in the API. Verify the preview with enough entries to overflow. [Finding previews spec](../../specs/pr-finding-previews.md)
- **Review rerun.** Trace active runs, history, and findings by internal PR ID. Check that the start path enables live tracking, reload reconnects while a run is active, and settlement refreshes affected queries without changing another PR's cached data. [Review query hooks](../../client/src/lib/hooks/reviews.ts) · [Run lifecycle](../../server/specs/review-runs.md)
- **A new App Router route.** Decide which work can render on the server, where client interactivity starts, and which data belongs to the browser query cache. Check direct load, reload, client navigation, and the production build if the route uses a static shell or request-time APIs. [PR detail spec](../../client/specs/pr-detail.md) · [Testing strategy](../../TESTING.md)

## Research and repository context

- The prior research contains the annotated source notes and their application to the project. [React and front-end research](../react-frontend-skill-research.md) · [Next.js architecture research](../nextjs-architecture-skill-research.md)
- Consult the repository for its current layout, versions, configuration, and data access. [Repository architecture](../../README.md#architecture) · [Client instructions](../../client/AGENTS.md) · [Client package](../../client/package.json) · [Root layout](../../client/src/app/layout.tsx) · [Next.js configuration](../../client/next.config.mjs) · [Query provider](../../client/src/lib/providers.tsx) · [Core API hooks](../../client/src/lib/hooks/core.ts) · [API client](../../client/src/lib/api.ts)
- Use specialist guides when the task changes their area. [React Testing Library](../../.agents/skills/react-testing-library/SKILL.md) · [UI/UX](../../.agents/skills/ui-ux-pro-max/SKILL.md) · [UI styling](../../.agents/skills/ui-styling/SKILL.md) · [Fastify](../../.agents/skills/fastify-best-practices/SKILL.md) · [Zod](../../.agents/skills/zod/SKILL.md) · [Security](../../.agents/skills/security/SKILL.md) · [TypeScript](../../.agents/skills/typescript-expert/SKILL.md)

## External sources

### React components, state, and rendering

- [Thinking in React](https://react.dev/learn/thinking-in-react)
- [Importing and exporting components](https://react.dev/learn/importing-and-exporting-components)
- [Components and hooks must be pure](https://react.dev/reference/rules/components-and-hooks-must-be-pure)
- [Preserving and resetting state](https://react.dev/learn/preserving-and-resetting-state)
- [Choosing the state structure](https://react.dev/learn/choosing-the-state-structure)
- [Sharing state between components](https://react.dev/learn/sharing-state-between-components)
- [Extracting state logic into a reducer](https://react.dev/learn/extracting-state-logic-into-a-reducer)
- [You might not need an effect](https://react.dev/learn/you-might-not-need-an-effect)
- [Reusing logic with custom hooks](https://react.dev/learn/reusing-logic-with-custom-hooks)
- [React Hooks lint rules](https://react.dev/reference/eslint-plugin-react-hooks)
- [React Profiler](https://react.dev/reference/react/Profiler)
- [React useMemo](https://react.dev/reference/react/useMemo)
- [React use client directive](https://react.dev/reference/rsc/use-client)
- [React use server directive](https://react.dev/reference/rsc/use-server)

### Frontend organization and verification

- [Kent C. Dodds on colocation](https://kentcdodds.com/blog/colocation)
- [Redux Style Guide](https://redux.js.org/style-guide)
- [Feature-Sliced Design slices and segments](https://feature-sliced.design/docs/reference/slices-segments)
- [Extract Function](https://refactoring.com/catalog/extractFunction.html)
- [Service Layer](https://martinfowler.com/eaaCatalog/serviceLayer.html)
- [Transaction Script](https://martinfowler.com/eaaCatalog/transactionScript.html)
- [TypeScript satisfies operator](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-4-9.html#the-satisfies-operator)
- [ESLint no-magic-numbers](https://eslint.org/docs/latest/rules/no-magic-numbers)
- [Design Tokens Format Module](https://www.designtokens.org/TR/2025.10/format/)
- [WAI ARIA Authoring Practices](https://www.w3.org/WAI/ARIA/apg/practices/read-me-first/)
- [WCAG 2.2 content on hover or focus](https://www.w3.org/WAI/WCAG22/Understanding/content-on-hover-or-focus.html)
- [Testing Library guiding principles](https://testing-library.com/docs/guiding-principles/)
- [Testing Library queries](https://testing-library.com/docs/queries/about/)

### Next.js App Router and delivery

- [Next.js 15 upgrade guide](https://nextjs.org/docs/app/guides/upgrading/version-15)
- [Next.js 16 upgrade guide](https://nextjs.org/docs/app/guides/upgrading/version-16)
- [Next.js 15 project structure](https://nextjs.org/docs/15/app/getting-started/project-structure)
- [Next.js 15 layouts](https://nextjs.org/docs/15/app/api-reference/file-conventions/layout)
- [Next.js 15 linking and navigation](https://nextjs.org/docs/15/app/getting-started/linking-and-navigating)
- [Next.js 15 useSearchParams](https://nextjs.org/docs/15/app/api-reference/functions/use-search-params)
- [Missing Suspense boundary with useSearchParams](https://nextjs.org/docs/messages/missing-suspense-with-csr-bailout)
- [Next.js 15 usePathname](https://nextjs.org/docs/15/app/api-reference/functions/use-pathname)
- [Current usePathname and Cache Components](https://nextjs.org/docs/app/api-reference/functions/use-pathname)
- [Next.js 15 loading file](https://nextjs.org/docs/15/app/api-reference/file-conventions/loading)
- [Next.js 15 Server and Client Components](https://nextjs.org/docs/15/app/getting-started/server-and-client-components)
- [Next.js 15 fetching data](https://nextjs.org/docs/15/app/getting-started/fetching-data)
- [Next.js 15 updating data](https://nextjs.org/docs/15/app/getting-started/updating-data)
- [Next.js 15 Backend for Frontend](https://nextjs.org/docs/15/app/guides/backend-for-frontend)
- [Next.js 15 Route Handlers](https://nextjs.org/docs/15/app/api-reference/file-conventions/route)
- [Next.js 15 data security](https://nextjs.org/docs/15/app/guides/data-security)
- [Next.js 15 authentication](https://nextjs.org/docs/15/app/guides/authentication)
- [Next.js 15 middleware](https://nextjs.org/docs/15/app/api-reference/file-conventions/middleware)
- [Next.js 15 caching](https://nextjs.org/docs/15/app/guides/caching)
- [Next.js 15 caching and revalidating](https://nextjs.org/docs/15/app/getting-started/caching-and-revalidating)
- [Next.js 15 error handling](https://nextjs.org/docs/15/app/getting-started/error-handling)
- [Next.js hydration errors](https://nextjs.org/docs/messages/react-hydration-error)
- [Next.js 15 lazy loading](https://nextjs.org/docs/15/app/guides/lazy-loading)
- [Next.js 15 package bundling](https://nextjs.org/docs/15/app/guides/package-bundling)
- [Next.js 15 environment variables](https://nextjs.org/docs/15/app/guides/environment-variables)
- [Next.js 15 Edge runtime](https://nextjs.org/docs/15/app/api-reference/edge)
- [Next.js 15 self-hosting](https://nextjs.org/docs/15/app/guides/self-hosting)
- [Next.js 15 standalone output](https://nextjs.org/docs/15/app/api-reference/config/next-config-js/output)
- [Next.js 15 metadata and OG images](https://nextjs.org/docs/15/app/getting-started/metadata-and-og-images)
- [Next.js 15 accessibility](https://nextjs.org/docs/15/architecture/accessibility)
- [Next.js 15 Image API](https://nextjs.org/docs/15/app/api-reference/components/image)
- [Next.js 15 fonts](https://nextjs.org/docs/15/app/getting-started/fonts)
- [Vitest with Next.js 15](https://nextjs.org/docs/15/app/guides/testing/vitest)
- [Next.js 15 production checklist](https://nextjs.org/docs/15/app/guides/production-checklist)
- [Next.js use cache directive](https://nextjs.org/docs/app/api-reference/directives/use-cache)
- [Next.js 16 MCP guide](https://nextjs.org/docs/app/guides/mcp)

### TanStack Query v5

- [Query options](https://tanstack.com/query/latest/docs/framework/react/guides/query-options)
- [Query keys](https://tanstack.com/query/latest/docs/framework/react/guides/query-keys)
- [Invalidations from mutations](https://tanstack.com/query/latest/docs/framework/react/guides/invalidations-from-mutations)
- [Advanced server rendering and data ownership](https://tanstack.com/query/latest/docs/framework/react/guides/advanced-ssr)
- [Important defaults](https://tanstack.com/query/latest/docs/framework/react/guides/important-defaults)
- [Query cancellation](https://tanstack.com/query/latest/docs/framework/react/guides/query-cancellation)
- [Disabling and pausing queries](https://tanstack.com/query/latest/docs/framework/react/guides/disabling-queries)
- [Optimistic updates](https://tanstack.com/query/latest/docs/framework/react/guides/optimistic-updates)
- [useQuery reference](https://tanstack.com/query/latest/docs/framework/react/reference/functions/useQuery)
- [Testing](https://tanstack.com/query/latest/docs/framework/react/guides/testing)
