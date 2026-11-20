# Review engine insights

The engine defaults to `auto` when a caller omits the strategy. The studio supplies the agent’s strategy and has its own single-pass fallback. In auto mode, the engine splits a review only when the diff spans multiple files and the number of changed lines exceeds the threshold. [Engine selection](src/review/run.ts) · [Studio executor](../server/src/modules/reviews/run-executor.ts) · [Studio fallback](../server/src/modules/reviews/constants.ts)
