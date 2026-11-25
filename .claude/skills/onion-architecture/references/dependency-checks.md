# Enforce backend dependency boundaries

Use the server's existing dependency-cruiser installation when the task adds an executable architecture check. Configure it for DevDigest source independently of the [repo-intel dependency-graph adapter](../../../../server/src/adapters/depgraph/index.ts), which analyzes imported repositories.

## Define the scope

1. Mark the domain, application, adapters, and composition files in the feature being enforced. Match their actual ownership and paths. A legacy `service.ts` name alone does not guarantee that it is application code.
2. Configure dependency-cruiser with the server's `tsconfig.json` and `tsPreCompilationDeps: true`. Check resolution for the server's `@devdigest/shared` and `@devdigest/reviewer-core` aliases. Include the type-only dependencies that reveal coupling to the container, storage rows, or SDK-specific types. Distinguish platform-neutral shared contracts from storage or transport contracts based on what they expose.
3. Apply narrow rules to the documented scope. Keep composition imports visible so their legal wiring can be verified. Ensure an unresolved import cannot appear to satisfy a rule just because the analysis failed to find it. The rules should produce the same outcomes on Windows and Linux.

| Check | Reject |
| --- | --- |
| Domain imports | Application code, transport, concrete persistence, SDKs, job runtime, and composition |
| Application imports | Inbound or outbound adapter internals, database schema or row types, SDKs, and composition |
| Cross-feature imports | Another feature's private files, including alternate aliases or barrels for those files |
| Layer or feature cycles | Circular dependencies within the enforced scope |

## Prove the check before gating CI

From `server/`, use the existing CLI with the architecture-specific config created for the rollout. For example, with `dependency-cruiser.architecture.cjs`:

```sh
pnpm exec depcruise --config dependency-cruiser.architecture.cjs src
```

Verify a legal route-to-use-case import and composition-to-adapter import pass. Demonstrate that an application-to-repository import fails through a relative path and through an alias, and that a type-only import of the container or a raw row type also fails. Check that a public cross-feature contract passes and a private cross-feature import or cycle fails. Use the resolved import graph to diagnose gaps in the selectors. Confirm the CI command exits nonzero for a new violation.

Start with the migrated feature when enforcing the rules in a legacy codebase. If the rollout uses a baseline, record and review specific existing violations and remove entries as they are fixed. Give new violations error severity. Keep authorization, runtime side effects, and transaction consistency under behavior tests so a clean import graph cannot substitute for those checks.

[Server TypeScript config](../../../../server/tsconfig.json) · [Dependency-cruiser 17.4.3 rules](https://github.com/sverweij/dependency-cruiser/blob/v17.4.3/doc/rules-reference.md) · [TypeScript analysis options](https://github.com/sverweij/dependency-cruiser/blob/v17.4.3/doc/options-reference.md) · [CLI and baselines](https://github.com/sverweij/dependency-cruiser/blob/v17.4.3/doc/cli.md) · [CI testing strategy](../../../../TESTING.md)
