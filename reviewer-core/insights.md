# Review engine insights

The engine defaults to `auto` when a caller omits the strategy. The studio supplies the agent’s strategy and has its own single-pass fallback. In auto mode, the engine splits a review only when the diff spans multiple files and the number of changed lines exceeds the threshold. [Engine selection](src/review/run.ts) · [Studio executor](../server/src/modules/reviews/run-executor.ts) · [Studio fallback](../server/src/modules/reviews/constants.ts)

Provider SDK retry hooks can call the attempt recorder directly. Validate charges at that boundary before updating the running total or invoking the callback, so invalid numbers cannot reach persisted usage and explicit zero remains a known charge. [Attempt accounting](src/llm/attempt-costs.ts) · [Regression tests](test/attempt-costs.test.ts)

A cancellation checkpoint between map chunks still allows schema-repair and SDK transport retries within a chunk. Check cancellation at the provider dispatch boundary. If that check blocks a transport retry, retain the unknown charge for the earlier dispatched request and omit an outcome for the request that never went out. [Dispatch accounting](src/llm/attempt-costs.ts) · [Retry tests](test/attempt-costs.test.ts)
