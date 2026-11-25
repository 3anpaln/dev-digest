# Worked example for updating an agent

The current agent service receives the whole container and creates its repository. The repository reads the agent, calls `isConfigChange`, updates the row, and writes a config snapshot when the version changes. The following is a target for a scoped refactor. [Agent service](../../../../server/src/modules/agents/service.ts) · [Repository](../../../../server/src/modules/agents/repository.ts) · [Current versioning rule](../../../../server/src/modules/agents/helpers.ts)

## Trace one use case

1. **Route.** Keep the existing agent update route and Zod shape. Resolve the caller's workspace through the auth adapter. Call `updateAgent` with the scoped agent ID and validated patch. Map its result to the existing DTO or not-found response.
2. **Application.** Define an `AgentUpdateStore` port around the scoped update operation. If the policy must read current data before writing, the port may expose a narrow transaction scope with operations for loading the scoped agent and saving the planned change. The use case obtains the current state, calls the versioning policy, and requests one consistent update.
3. **Domain.** Move the versioning decision to a pure function over a portable agent configuration and patch. For example, toggling only `enabled` keeps the current version. A changed versioned field increments it. Preserve the existing behavior that a supplied `output_schema` counts as a configuration change. If the product wants different semantics, make that a deliberate behavior change and test it.
4. **Persistence and composition.** Implement the port with the existing Drizzle repository or a focused adapter. Keep the scoped read, agent update, and applicable snapshot consistent. Where concurrent requests could compute the same next version, protect the read and write within the transaction or use a version check that detects the conflict. Wire the adapter into the use case through the existing composition root.

```text
routes.ts -> updateAgent -> agent versioning policy
                         -> AgentUpdateStore port
Drizzle adapter ---------> AgentUpdateStore port
composition root --------> use case and Drizzle adapter
```

The other agent operations can keep their existing paths while this use case migrates. Choose files around the names and behavior the feature already uses. A separate package or a generic CRUD interface is unnecessary for this slice.

## Verify at each boundary

| Test | Evidence |
| --- | --- |
| Domain unit test | An enabled-only patch keeps the version. A changed versioned field or supplied output schema requests a new version under the current policy. |
| Application test with a fake port | The use case passes workspace and agent identity to the store, requests the expected write, and returns a missing result without writing if the agent is absent. |
| Fastify test | The actual route keeps its validation and response contract and the caller cannot act on an agent outside its workspace. |
| PostgreSQL integration test | A versioned update and its snapshot commit together. An injected write failure or a competing update leaves the persisted versions consistent. |

Use the existing [agent version integration tests](../../../../server/test/agents-versions.it.test.ts) for fixture conventions and the [dependency checks](dependency-checks.md) to exercise the new import boundary.
