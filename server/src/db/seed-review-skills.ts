import type { SkillType } from '@devdigest/shared';

export const REVIEW_SKILL_PRESETS = [
  {
    id: '54bd0641-daf4-4fe7-8cab-f447b9495681',
    name: 'Route compatibility',
    type: 'rubric',
    description: 'Check changed API contracts against existing consumers.',
    body: `# Route compatibility

- Compare the old and new path, method, required parameters, request fields, response shape, and status codes for changed routes.
- Check affected clients, CI integrations, and shared contracts visible in the review context. Consider older callers and persisted payloads.
- Report a breaking change when you can identify a previously valid request or response consumer that now fails. Cite the changed line and explain the concrete caller impact.`,
  },
  {
    id: '54bd0641-daf4-4fe7-8cab-f447b9495682',
    name: 'Test reliability',
    type: 'rubric',
    description: 'Check whether tests exercise changed behavior and catch regressions.',
    body: `# Test reliability

- Match changed behavior to tests that assert user-visible results or persisted state. Check relevant failure paths and boundaries.
- Look for mocks that bypass the changed behavior, assertions that would pass with the behavior broken, and asynchronous assertions that can run too early.
- Report the specific regression that could escape and describe the assertion that would catch it. Avoid generic coverage requests.`,
  },
  {
    id: '54bd0641-daf4-4fe7-8cab-f447b9495683',
    name: 'Authorization boundaries',
    type: 'security',
    description: 'Check permissions and workspace isolation for changed operations.',
    body: `# Authorization boundaries

- Check that changed reads, writes, and background operations enforce the expected user and workspace scope on the server.
- Follow resource IDs through lookups and mutations. Check that related records belong to the same authorized scope, including list and aggregate responses.
- Report confirmed gaps in access enforcement. Cite the missing check and identify the data or operation exposed. Describe how to enforce the intended policy.`,
  },
  {
    id: '54bd0641-daf4-4fe7-8cab-f447b9495684',
    name: 'State and concurrency',
    type: 'rubric',
    description: 'Review multi-step writes, retries, cancellation, and concurrent edits.',
    body: `# State and concurrency

- Check related writes for atomicity and identify the state left behind when an intermediate step fails.
- Consider concurrent requests, retried requests, and cancelled background work. Check for lost updates, duplicate side effects, and transitions that can overwrite a terminal state.
- Report the concrete sequence that produces an incorrect result, the violated invariant, and a focused way to preserve it.`,
  },
  {
    id: '54bd0641-daf4-4fe7-8cab-f447b9495685',
    name: 'Schema change safety',
    type: 'convention',
    description: 'Check that schema changes preserve existing data and support rollout.',
    body: `# Schema change safety

- Check changed defaults, constraints, and types against rows created before the change. Consider missing values, duplicates, and existing references.
- Check that schema changes use a new migration and preserve existing migration history. Review the order of backfills and constraint changes when required.
- Report the actual row shape or deployment order that can fail. Describe the upgrade-safe change needed to preserve data and behavior.`,
  },
  {
    id: '54bd0641-daf4-4fe7-8cab-f447b9495686',
    name: 'Performance regressions',
    type: 'rubric',
    description: 'Find repeated expensive work and unbounded operations on review paths.',
    body: `# Performance regressions

- Inspect changed list, polling, and review paths for queries per item, unbounded reads, or repeated expensive work.
- Check whether the cost grows with repository size, response size, or concurrent runs. Identify the query or operation that dominates.
- Report regressions with a plausible workload and a concrete alternative such as batching, bounding, or reusing work. Avoid speculative micro-optimizations.`,
  },
  {
    id: '54bd0641-daf4-4fe7-8cab-f447b9495687',
    name: 'Failure recovery',
    type: 'rubric',
    description: 'Check that failed requests and jobs leave users able to recover.',
    body: `# Failure recovery

- Follow errors through the API, UI, and background jobs touched by the change. Confirm the user can distinguish success, empty data, and failure.
- Check that a failed save preserves the draft or prior saved state and that a retry does not repeat completed side effects.
- Report failures that leave misleading status, lose user work, or make recovery impossible. Cite the failure path and the expected recovery behavior.`,
  },
] satisfies ReadonlyArray<{ id: string; name: string; type: SkillType; description: string; body: string }>;
