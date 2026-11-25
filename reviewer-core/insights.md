# Review engine insights

**2026-11-20** The engine defaults to `auto` when a caller omits the strategy. The studio supplies the agent’s strategy and has its own single-pass fallback. In auto mode, the engine splits a review only when the diff spans multiple files and the number of changed lines exceeds the threshold. [Engine selection](src/review/run.ts#L115) · [Studio executor](../server/src/modules/reviews/run-executor.ts#L197) · [Studio fallback](../server/src/modules/reviews/constants.ts#L12)

**2026-11-21** Provider SDK retry hooks can call the attempt recorder directly. Validate charges at that boundary before updating the running total or invoking the callback, so invalid numbers cannot reach persisted usage and explicit zero remains a known charge. [Attempt accounting](src/llm/attempt-costs.ts#L22) · [Regression tests](test/attempt-costs.test.ts#L41)

**2026-11-21** A cancellation checkpoint between map chunks still allows schema-repair and SDK transport retries within a chunk. Check cancellation at the provider dispatch boundary. If that check blocks a transport retry, retain the unknown charge for the earlier dispatched request and omit an outcome for the request that never went out. [Dispatch accounting](src/llm/attempt-costs.ts#L10) · [Retry tests](test/attempt-costs.test.ts#L84)

**2026-11-21** Keep the OpenRouter endpoint explicit when constructing its OpenAI SDK client, since the SDK can otherwise inherit OPENAI_BASE_URL. Inject a stub transport for request and retry tests so those tests can inspect the destination without adding a configurable destination for credentials. [Provider constructor](src/llm/openrouter.ts#L65) · [Request tests](test/attempt-costs.test.ts#L6)

**2026-11-21** When sanitizing structured provider errors, retain only the numeric HTTP status and recognized network codes used by retry policies. Original provider messages, bodies, headers and causes can reach persisted review logs. Preserve pre-dispatch cancellation signals so the executor can classify the run correctly. [Attempt failure handling](src/llm/attempt-costs.ts#L37) · [Provider tests](test/attempt-costs.test.ts#L62)
