---
name: react-best-practices
description: Implement or review React component behavior, including rendering, identity, state, hooks, and effects.
metadata:
  version: "1.0.0"
---

# React Best Practices

Read the component and its normal callers before changing its behavior. Identify the source of truth for what it renders, the events that change it, and the component identities or keys that preserve its state.

## Rendering and identity

- Keep rendering idempotent for the same props, state, and context. Write to external systems from event handlers or effects as appropriate. Treat props, state, and values passed to hooks or JSX as immutable.
- Declare component types at module scope. Use stable data identity for list keys where items can be filtered, inserted, or reordered. Change the key intentionally when switching to a conceptually new item should reset local state.
- Make the render paths for loading, error, empty, and success easy to follow. Use an explicit boolean check where a numeric falsey value such as zero would otherwise render as text.
- Profile a slow interaction before adding memoization. Keep correctness independent of a memoized calculation and check the existing compiler and performance tooling before choosing an optimization.

## State, events, and effects

- Keep interaction state near its owner. Lift it to the closest common owner when siblings have to stay in sync. Store the minimum data needed and derive filtered results, totals, and selected objects from current inputs. Consider a reducer when related transitions are scattered across handlers.
- Compute display values during render. Put an action caused by user input in its event handler. Use effects to synchronize with external systems and clean up listeners, subscriptions, or timers when the effect ends. Keep reactive dependencies accurate.
- Use custom hooks to name React-dependent behavior. Calls ordinarily have independent local state. Use lifted state, context, or an established store or cache when consumers need the same state. A pure calculation can stay inline or move to an ordinary named helper. Follow the Rules of Hooks when moving hook calls.
- Give controls semantic roles, accessible names, and the keyboard and focus behavior their interaction requires. Verify moved state and event timing through user-visible behavior and exercise browser-specific behavior in a browser when relevant.

For file placement and decomposition, use [frontend architecture](../frontend-architecture/SKILL.md). For App Router boundaries use [Next.js best practices](../next-best-practices/SKILL.md). For browser-side API data use [TanStack Query best practices](../tanstack-query-best-practices/SKILL.md). See the [frontend skills README](../../../docs/frontend-skills/README.md) for sources.
