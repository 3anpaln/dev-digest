# Browser flows

- Run `bash scripts/e2e.sh` from the repository root for a freshly seeded, isolated stack. Install the agent-browser CLI and its browser before running the suite.
- Use deterministic CLI steps and assertions against seeded data. Keep real model calls and the agent-browser `chat` command out of flows.
- Use `{BASE}` for the configured app origin. Wait for an observable URL or visible text before asserting on navigation.
- Read the [harness references](docs/README.md) when editing the runner, the existing [flow specs](specs/) when extending a journey, and [insights](insights.md) when a scenario reaches the wrong repository.
