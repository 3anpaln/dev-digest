# Suspense and navigation hooks

## Next.js 15

On a statically rendered App Router route, reading `useSearchParams()` causes the client subtree up to the nearest Suspense boundary to render on the client. Wrap the smallest subtree that needs the hook to preserve the static shell. Run the production build because development can behave differently.

For a route that needs query parameters on the server, read the page's async `searchParams` prop. To make a route request-rendered intentionally, use an appropriate server-side mechanism such as `connection()`. A shared layout can persist across navigations, so read live URL state from the page or a Client Component.

`usePathname()` is a Client Component hook. In Next.js 15, check for hydration differences if rewrites make the browser pathname differ from the prerendered path.

## Cache Components in newer Next.js versions

When Cache Components are enabled, `usePathname()` may require Suspense if the pathname is unavailable during prerendering. Check the installed version and route configuration before applying that rule.

See [v15 useSearchParams](https://nextjs.org/docs/15/app/api-reference/functions/use-search-params), [v15 usePathname](https://nextjs.org/docs/15/app/api-reference/functions/use-pathname), [Current usePathname](https://nextjs.org/docs/app/api-reference/functions/use-pathname), and [Missing Suspense boundary](https://nextjs.org/docs/messages/missing-suspense-with-csr-bailout).
