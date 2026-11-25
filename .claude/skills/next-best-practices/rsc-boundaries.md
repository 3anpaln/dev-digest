# Server and Client Component boundaries

Check the import graph starting at each `'use client'` entry. Everything it imports for runtime must be safe in the browser. Place privileged dependencies and secrets behind server-only modules. Keep providers as deep as their consumers permit. Server-rendered content can be passed as `children` to a client wrapper.

## Rendering and async work

A Client Component's render function must be synchronous. An asynchronous event handler or query function called by a Client Component is valid. Use a Server Component for an async initial read when the rendering architecture fits. Use the project's query layer for browser-owned data and the server mutation layer for writes.

## Props across the boundary

React's serialization rules for Server Components are broader than JSON. Supported values include primitives, plain objects with serializable properties, arrays, and built-ins such as `Date`, `Map`, and `Set`. Ordinary closures and arbitrary class instances cannot cross the boundary. Keep a client click handler in the client module, or pass a Server Function when the UI needs to invoke a trusted server operation.

Pass only the fields needed by the view. Use the API contract when a payload also crosses an HTTP JSON boundary, for example keeping timestamps as strings when the API defines them that way. React serialization support does not make an ORM object or private field appropriate to expose.

## Server Functions

Use `'use server'` for callable async server functions. Ordinary Server Components do not need this directive. A Server Action can be passed to a client form, and its arguments remain untrusted even when the action is imported from a private file. Validate input and authorize the action inside the trusted data path.

See [React use client](https://react.dev/reference/rsc/use-client), [React use server](https://react.dev/reference/rsc/use-server), and [Next.js 15 server and client components](https://nextjs.org/docs/15/app/getting-started/server-and-client-components).
