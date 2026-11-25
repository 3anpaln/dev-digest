# Research for a React and front-end best practices skill

Research notes collected on 2026-11-25 for a future README and Codex skill. The notes cover React component design and front-end architecture, with versioned Next.js 15 guidance and TanStack Query v5 examples for DevDigest. The annotated sources below preserve the relevant material in paraphrase.

The [Next.js 15 architecture research](nextjs-architecture-skill-research.md) builds on these notes with framework-specific decisions and a map of the skills that support them.

## Component placement and decomposition

- **Start with the smallest owner.** Keep a small, private subcomponent in the same file as its parent when readers benefit from seeing them together. Give it a sibling file when the JSX, interaction, or tests become substantial. Keep route-only files beside their route. Promote a component to a feature module when multiple routes need the same product behavior. Promote it to shared UI when its contract is independent of any feature. [React component files][react-files] · [Colocation][colocation] · [Next.js project structure][next-structure]
- **Split at a meaningful responsibility.** A search form, results table, and interactive row may each have a distinct contract. Extract a child when its name explains a distinct part of the screen, when it owns cohesive behavior or accessibility, or when it can be reused with the same semantics. A few static lines of markup can stay with their parent. File length, prop count, and JSX depth are prompts to inspect the code. [Thinking in React][react-thinking]
- **Keep the public surface small.** Name components for the job they do. Put private subcomponents at module scope so React keeps their identity across renders. Follow repo conventions for imports and exports. A feature's public entry point can be useful when callers outside the feature need a stable API. [React component files][react-files] · [React state and identity][react-identity] · [Feature-Sliced Design][fsd]
- **Treat routing conventions as framework-specific.** Next.js App Router supports colocation inside `app/`. Special files such as `page.tsx` and `route.ts` define public routes, and a leading underscore opts a folder out of routing. DevDigest explicitly puts route-specific UI under `_components/`. A React project with a different router can apply the ownership principle using its own file conventions. [Next.js project structure][next-structure] · [DevDigest client instructions](../client/AGENTS.md)

## Constants and configuration

Placement is a design judgment about who owns the value and what makes it change. Use a name when a literal has meaning that its use site cannot convey. Preserve an existing authoritative definition when the value already belongs to a contract, a policy, or a design token. [Colocation][colocation] · [ESLint on named numeric values][magic-numbers] · [Design Tokens Format Module][tokens]

| Value | Suggested owner | Example |
| --- | --- | --- |
| Obvious literal used once | At the use site | An empty string used to clear a field |
| Static value specific to one component | A private module-level constant beside that component | `MAX_PREVIEW_HEIGHT_PX` |
| Static order or defaults shared within a feature | A feature-owned module named for the concept | `severityOrder.ts` when several views depend on the same display order |
| API values, status vocabulary, and authoritative thresholds | The existing contract, configuration, or policy that owns the value | A merge threshold enforced by the server |
| Theme values and user-facing strings | The design token system or message catalog | A semantic warning color or a translated status label |
| Deployment-dependent settings and secrets | The appropriate environment configuration or secret provider | A public API base URL or a server-only credential |

For TypeScript lookup tables, `satisfies` can check that a map conforms to a type while retaining useful inference. An exhaustive map can use `Record<K, V>` when every key is required. In Next.js, direct references to public environment variables can become build-time values in the browser bundle. Treat any such value as public and use the established server configuration for secrets. [TypeScript on `satisfies`][ts-satisfies] · [Next.js environment variables][next-env]

## Where to put logic

| Responsibility | Suggested home | Decision test |
| --- | --- | --- |
| Simple render-time conditions and derivations | Component body or JSX | Copy, visibility, or a small calculation obvious from the current props and state |
| Pure formatting, sorting, grouping, or mapping | Private function near the caller, or a named feature module when useful | A descriptive name clarifies intent, edge cases merit direct tests, or the same operation serves several callers |
| Shared generic utility | Existing shared utility area | The function has domain-independent inputs and semantics across callers |
| Stateful interaction or DOM subscription | Component first, then a focused custom hook when a named behavior improves the boundary | Needs React state, lifecycle, refs, context, or a library hook |
| Coordinated state transitions | A pure reducer near its owner | Multiple actions update related state or require explicit transition rules |
| Transport and cache behavior | Existing API client and feature-owned query or mutation logic | Needs request construction, query keys, cancellation, or cache invalidation |
| Product rules and calculations | The owning feature or domain module with explicit inputs | The result must follow the same rule across views, workflows, or consumers |
| Authoritative validation, authorization, or writes | Server-side application or domain code at the relevant trust boundary | A client can bypass the UI, so the API must enforce the rule itself |

A named helper can improve a single call site when it describes a real operation. Keep a short one-off calculation inline when extraction would make readers jump files to understand it. Prefer names such as `groupFindingsBySeverity` or `formatReviewCost` for extracted logic. Keep product-specific terms in feature-owned code, and keep deterministic rules callable without rendering a component. [Extract Function][extract-function] · [Colocation][colocation] · [Feature-Sliced Design][fsd]

A hook should describe which React-dependent behavior it provides. A pure predicate or formatter can be an ordinary function. A hook that orchestrates a mutation may call a pure rule and the API adapter. Each caller gets its own hook state unless the hook reads from a source that is actually shared. [React custom hooks][react-hooks] · [React state sharing][react-share]

For example, a PR row can decide how to display a disabled action from the API result. The review service owns the rule that decides whether the action is allowed and enforces it when processing the request. A dedicated service boundary makes sense when several entry points need the same operation or when the operation coordinates writes. A small application can use a single well-named function for a straightforward operation. [Next.js data security][next-security] · [Service Layer][service-layer] · [Transaction Script][transaction-script]

## State, effects, and data flow

- Keep ephemeral state with the interaction that owns it. Lift it to the nearest common owner when multiple components have to remain in sync. Derive values such as a filtered list or a selected item from existing data and a stable ID. Consider a reducer when events and transitions are scattered across handlers. [React state structure][react-state] · [React state sharing][react-share] · [React reducers][react-reducer]
- Keep state intended to survive reload or be shared by URL in the route or URL contract when the feature calls for it. Keep fetched server data in the existing query cache. Copy fetched data into local state only when it has a distinct purpose such as an editable draft with its own lifecycle. DevDigest's PR detail uses the URL for its tab and trace selection. [React state structure][react-state] · [TanStack Query keys][query-keys] · [DevDigest PR detail spec](../client/specs/pr-detail.md)
- Calculate display values during render, run user-triggered work in its event handler or mutation, and use effects to synchronize with systems outside React. Keep effect dependencies accurate and clean up subscriptions and listeners. React may render more than once, so render logic must tolerate reevaluation. Mutating a newly created local array can be fine. Mutating props, state, or other pre-existing values during render breaks that assumption. [React purity][react-purity] · [React effects][react-effects] · [React Hooks lint rules][react-lint]
- In TanStack Query, keep the query key aligned with every changing input that identifies the fetched data. Reuse the same query definition where consumers need the same data, and invalidate affected queries after successful mutations when appropriate. On Next.js App Router projects, use server components for work that can stay on the server and use client boundaries where interactivity, hooks, or browser APIs require them. Follow the existing data-loading architecture for the feature. [TanStack Query options][query-options] · [TanStack Query keys][query-keys] · [TanStack Query invalidation][query-invalidation] · [Next.js server and client components][next-boundaries]

## Accessibility, performance, and verification

- Use semantic controls, accessible names, and the keyboard and focus behavior appropriate for the interaction. A hover preview should support moving the pointer into its content and remain available while being read, with dismissal behavior appropriate to the accessibility criterion. Exercise focus, Escape, and real scrolling where they matter. [WAI ARIA Authoring Practices][wai-apg] · [WCAG 2.2 hover or focus guidance][wai-hover]
- Profile a slow interaction before adding memoization. Treat `useMemo` as a performance tool and keep the feature correct when React recomputes the value. When using App Router, account for the code brought into the client bundle by the modules beneath a client boundary. [React Profiler][react-profiler] · [React `useMemo`][react-memo] · [Next.js server and client components][next-boundaries]
- Test a complex pure rule through its inputs and outputs. Test components through visible behavior and semantic queries. Use a real browser for layout, scroll overflow, pointer movement, or focus behavior that depends on the browser's implementation. The test should exercise the feature with enough data to expose the failure. [Testing Library guiding principles][testing-principles] · [Testing Library queries][testing-queries] · [DevDigest testing strategy](../TESTING.md)

## Decisions for the future skill

1. Keep React correctness guidance precise. Render purity, hook call rules, and component identity have concrete behavioral consequences. Treat file placement, one component per file, line limits, and which styles to use as conventions to read from the repo or choose based on cohesion. [React purity][react-purity] · [React component files][react-files] · [React state and identity][react-identity] · [React Hooks lint rules][react-lint]
2. Give a short decision procedure. Identify the owner and runtime, determine whether the code renders, calculates, manages interaction, fetches data, or enforces policy, and choose the smallest boundary that expresses that job. Add a worked example showing how one route feature can grow without starting with empty `components/`, `hooks/`, `utils/`, and `constants/` folders. [Thinking in React][react-thinking] · [Colocation][colocation] · [Redux Style Guide][redux-style]
3. Use the existing React skill as an overlap check. Its guidance on feature colocation and derived state fits here. Its line and prop limits, fixed styling choices, container split, and requirement to fetch only in custom hooks need either a project-specific rationale or wording as optional heuristics. The Next.js docs include server-side data access from server components as a supported approach. [Existing React skill](../.claude/skills/react-best-practices/SKILL.md) · [Next.js server and client components][next-boundaries] · [Next.js data security][next-security]

## Annotated source list

### React

- **Thinking in React** starts from a UI and data model, names a component hierarchy, and works out the minimum state and where it should be owned. Its table example keeps a simple header inline and describes when a more complex header could become its own component. [React][react-thinking]
- **Importing and Exporting Components** demonstrates sibling files, named and default exports, and files with more than one component. Named component functions and descriptive files make debugging and navigation easier. [React][react-files]
- **Components and Hooks must be pure** explains reevaluation during render, immutable inputs, and the safety of mutation limited to values created during the current render. [React][react-purity]
- **Preserving and Resetting State** explains how tree position, component type, and keys affect state. A component declared inside another component can be recreated on each render, resetting the subtree. [React][react-identity]
- **Choosing the State Structure** recommends keeping state minimal, avoiding contradictions and duplicate values, and grouping fields that change together. [React][react-state]
- **Sharing State Between Components** demonstrates moving one source of truth to a common parent and passing controlled values and callbacks to children. [React][react-share]
- **Extracting State Logic into a Reducer** shows actions describing interactions and a reducer calculating the next state, including when a reducer is worth the extra structure. [React][react-reducer]
- **You Might Not Need an Effect** distinguishes render-time data transformations, user events, and synchronization with external systems. It also covers sharing event logic through ordinary functions. [React][react-effects]
- **Reusing Logic with Custom Hooks** shows how to name a focused hook, extract a stateful behavior, and understand the independent lifecycle of each call. [React][react-hooks]
- **Hooks lint rules, Profiler, and `useMemo`** provide checks for hook correctness and component identity, ways to measure render cost, and tradeoffs for caching calculations. Check the project's installed tooling before prescribing particular lint rules. [React Hooks lint rules][react-lint] · [React Profiler][react-profiler] · [React `useMemo`][react-memo]

### Frameworks, architecture, and platform

- **Next.js 15 project structure** describes route segments, special files, private folders, and multiple supported approaches to colocation. [Next.js][next-structure]
- **Next.js 15 server and client components** explains the module boundary created by `'use client'`, server-rendered composition, serializable props across the boundary, and server-only modules. [Next.js][next-boundaries]
- **Next.js 15 data security and environment variables** cover authorization where data is accessed, minimal data exposed to consumers, and build-time exposure of public configuration. The data security guide addresses separate HTTP APIs as well as applications with their own server data layer. [Next.js data security][next-security] · [Next.js environment variables][next-env]
- **TanStack Query v5** explains how to share query definitions, include changing inputs in the cache key, and invalidate related cached data from mutation callbacks. [Query options][query-options] · [Query keys][query-keys] · [Invalidations from mutations][query-invalidation]
- **Colocation, by Kent C. Dodds**, gives a practical example of how a single-use helper and its tests can outlive a feature when they are placed far away from their only caller. [Original article][colocation]
- **Redux Style Guide** recommends feature folders to keep related changes together. Its reducer and slice recommendations apply to Redux projects. [Redux][redux-style]
- **Feature-Sliced Design** describes modules organized around product concepts, explicit public APIs, and optional technical segments within an owning feature. Its complete layering scheme is one architecture methodology. [Feature-Sliced Design][fsd]
- **Extract Function, Service Layer, and Transaction Script** give examples of naming a cohesive operation, coordinating operations behind a service boundary, and keeping a simple transaction in one procedure. [Refactoring catalog][extract-function] · [Service Layer][service-layer] · [Transaction Script][transaction-script]
- **TypeScript, ESLint, and the Design Tokens Community Group** cover checking typed configuration without losing inference, naming meaningful numeric values, and representing shared design values. The token format is an interoperability specification from a Community Group. [TypeScript][ts-satisfies] · [ESLint][magic-numbers] · [Design Tokens Format Module][tokens]
- **WAI and Testing Library** document accessible interaction behavior and testing through the DOM from the user's perspective. [ARIA Authoring Practices][wai-apg] · [WCAG 2.2 hover or focus guidance][wai-hover] · [Testing Library guiding principles][testing-principles] · [Testing Library queries][testing-queries]

[react-thinking]: https://react.dev/learn/thinking-in-react
[react-files]: https://react.dev/learn/importing-and-exporting-components
[react-purity]: https://react.dev/reference/rules/components-and-hooks-must-be-pure
[react-identity]: https://react.dev/learn/preserving-and-resetting-state
[react-state]: https://react.dev/learn/choosing-the-state-structure
[react-share]: https://react.dev/learn/sharing-state-between-components
[react-reducer]: https://react.dev/learn/extracting-state-logic-into-a-reducer
[react-effects]: https://react.dev/learn/you-might-not-need-an-effect
[react-hooks]: https://react.dev/learn/reusing-logic-with-custom-hooks
[react-lint]: https://react.dev/reference/eslint-plugin-react-hooks
[react-profiler]: https://react.dev/reference/react/Profiler
[react-memo]: https://react.dev/reference/react/useMemo
[next-structure]: https://nextjs.org/docs/15/app/getting-started/project-structure
[next-boundaries]: https://nextjs.org/docs/15/app/getting-started/server-and-client-components
[next-security]: https://nextjs.org/docs/15/app/guides/data-security
[next-env]: https://nextjs.org/docs/15/app/guides/environment-variables
[query-options]: https://tanstack.com/query/latest/docs/framework/react/guides/query-options
[query-keys]: https://tanstack.com/query/latest/docs/framework/react/guides/query-keys
[query-invalidation]: https://tanstack.com/query/latest/docs/framework/react/guides/invalidations-from-mutations
[colocation]: https://kentcdodds.com/blog/colocation
[redux-style]: https://redux.js.org/style-guide
[fsd]: https://feature-sliced.design/docs/reference/slices-segments
[extract-function]: https://refactoring.com/catalog/extractFunction.html
[service-layer]: https://martinfowler.com/eaaCatalog/serviceLayer.html
[transaction-script]: https://martinfowler.com/eaaCatalog/transactionScript.html
[ts-satisfies]: https://www.typescriptlang.org/docs/handbook/release-notes/typescript-4-9.html#the-satisfies-operator
[magic-numbers]: https://eslint.org/docs/latest/rules/no-magic-numbers
[tokens]: https://www.designtokens.org/TR/2025.10/format/
[wai-apg]: https://www.w3.org/WAI/ARIA/apg/practices/read-me-first/
[wai-hover]: https://www.w3.org/WAI/WCAG22/Understanding/content-on-hover-or-focus.html
[testing-principles]: https://testing-library.com/docs/guiding-principles/
[testing-queries]: https://testing-library.com/docs/queries/about/
