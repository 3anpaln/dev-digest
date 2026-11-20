# Review engine

- Keep Git, GitHub, database access, and run persistence in the caller. Pass the model client through `ReviewInput.llm` and stub it in tests.
- Assemble prompts through the shared prompt builder so repository text and PR descriptions retain their untrusted-data boundaries.
- Apply the shared grounding and scoring logic after merging partial results from every review strategy.
- Read the [engine references](docs/README.md) when changing the public interface, the [grounding spec](specs/grounding.md) for citation or score changes, and [insights](insights.md) when investigating the number of model calls.
