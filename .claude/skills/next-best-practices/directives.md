# Directives

## React Directives

These are React directives, not Next.js specific.

### `'use client'`

Marks a component as a Client Component. Required for:
- React hooks (`useState`, `useEffect`, etc.)
- Event handlers (`onClick`, `onChange`)
- Browser APIs (`window`, `localStorage`)

```tsx
'use client'

import { useState } from 'react'

export function Counter() {
  const [count, setCount] = useState(0)
  return <button onClick={() => setCount(count + 1)}>{count}</button>
}
```

Reference: https://react.dev/reference/rsc/use-client

### `'use server'`

Marks a function as a Server Action. Can be passed to Client Components.

```tsx
'use server'

export async function submitForm(formData: FormData) {
  // Runs on server
}
```

Or inline within a Server Component:

```tsx
export default function Page() {
  async function submit() {
    'use server'
    // Runs on server
  }
  return <form action={submit}>...</form>
}
```

Reference: https://react.dev/reference/rsc/use-server

---

## Next.js Directive

### `'use cache'`

Marks a function or component for caching with Cache Components. Use the example below for Next.js 16 with Cache Components enabled. For DevDigest on Next.js 15, use the version-specific fetch caching and revalidation guidance in [app data patterns](data-patterns.md).

```tsx
'use cache'

export async function getCachedData() {
  return await fetchData()
}
```

Requires `cacheComponents: true` in `next.config.ts`.

For cache profiles and tags, use the linked API reference for the installed version.

Reference: https://nextjs.org/docs/app/api-reference/directives/use-cache
