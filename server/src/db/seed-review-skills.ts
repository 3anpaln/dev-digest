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
  {
    id: '54bd0641-daf4-4fe7-8cab-f447b9495688',
    name: 'breaking-change',
    type: 'rubric',
    description: 'Find public API changes that break existing callers.',
    body: `# Breaking change

- Identify the affected public API and version from published contracts, documentation, or supported consumers. Compare the previous contract with the proposed behavior.
- Check for removed or renamed operations, stricter input validation, newly required inputs or permissions, and changes to documented status codes, headers, or behavior. Check whether a compatibility alias, default, or existing API version preserves the old behavior.
- Cite the changed line, state the old and new behavior, and describe a previously valid request or caller assumption that fails. Suggest the smallest change that would preserve compatibility or give callers a migration path.
- Check payload shape as part of the public contract. When response-schema is active, let it report payload-only incompatibilities. Keep one finding per caller-visible break and include any applicable release or deprecation fix in its suggestion.`,
  },
  {
    id: '54bd0641-daf4-4fe7-8cab-f447b9495689',
    name: 'response-schema',
    type: 'rubric',
    description: 'Check whether changed success and error payloads remain compatible with existing readers.',
    body: `# Response schema

- Compare the old and new success and error payloads for the same API version, status, and media type. Check the published schema and actual serialization where both are available.
- Check field removal and renaming, type and format changes, presence and nullability, nested and collection shapes, and enum or discriminator changes. Consider both strict decoding and what callers can safely assume after decoding.
- Treat additive fields as compatible when existing readers accept unknown keys. Flag a new field or enum value only when a documented constraint or supported reader, such as a strict decoder or exhaustive handler, makes it incompatible.
- Cite the changed line, operation, and field path. Describe the previous guarantee and show how a concrete new payload can fail in an existing reader. Suggest preserving the old shape or introducing the change in a new API version.`,
  },
  {
    id: '54bd0641-daf4-4fe7-8cab-f447b9495690',
    name: 'semver-discipline',
    type: 'rubric',
    description: 'Check whether a confirmed public API break is marked for the correct release.',
    body: `# SemVer discipline

- Start with a confirmed public API incompatibility. Identify the affected release unit and its versioning policy from repository documentation, manifests, or release automation. In a monorepo, trace the change to the package or API that actually ships it.
- For a stable public API governed by SemVer, require a major release for an incompatible change. Apply the project's documented policy for pre-1.0, prerelease, or independently versioned APIs. Check any changeset, label, or release metadata the project uses to determine the next version.
- Flag a missing or insufficient release signal only when the policy and relevant mechanism are evident. When policy or release context is missing, identify what needs confirmation in the compatibility finding without declaring a version violation.
- Cite the break and the applicable policy or release mechanism. Include the required release adjustment in the same finding when the compatibility break is already reported. A version bump communicates the break and callers still need a migration path.

[Semantic Versioning 2.0.0](https://semver.org/)`,
  },
  {
    id: '54bd0641-daf4-4fe7-8cab-f447b9495691',
    name: 'deprecation-policy',
    type: 'rubric',
    description: 'Check that public API changes give existing consumers a visible migration path.',
    body: `# Deprecation policy

- Find the project's policy for deprecating public operations, fields, and other contract elements. Check the documented notice window, supported versions, and required communication channels before judging a removal.
- During the transition, keep the old contract usable and mark it deprecated where consumers look, such as the API schema, API docs, release notes, or the project's standard headers. Name the replacement and provide migration instructions. Record the removal date or version when it is known or required.
- For a removal, verify that prior notice and the applicable support window are evidenced. When policy is missing, recommend a visible deprecation and a migration path without inventing a deadline or mandatory channel.
- Cite the changed contract and state which notice or migration step is missing and who it affects. For a silent removal already reported as breaking, include the deprecation fix in that finding. For a still-working API, report a concrete gap in required notice or migration guidance.`,
  },
] satisfies ReadonlyArray<{ id: string; name: string; type: SkillType; description: string; body: string }>;
