# Cross-package insights

**2026-11-20** A typecheck can pass in both the client and server while their API shapes disagree. Each resolves `@devdigest/shared` to its own vendored directory. Reviewer-core resolves the same name to the server copy. When investigating a response mismatch, compare the contract and its consumer on both sides of the HTTP call. [Client aliases](client/tsconfig.json#L24) · [Server aliases](server/tsconfig.json#L22) · [Engine aliases](reviewer-core/tsconfig.json#L22)

**2026-11-22** If `dev.sh` reports `ERR_PNPM_VERIFY_DEPS_BEFORE_RUN` after printing the server command, check the pnpm version used for both packages. The script also launches the client, where pnpm 12 can reject the lockfile's overrides. Use the same pnpm 10 command for installs, migrations, and both dev servers. [Bootstrap script](scripts/dev.sh#L38) · [Client lockfile notes](client/insights.md?plain=1#L15)

**2026-11-25** When adding a Codex entry for a shared skill with `disable-model-invocation: true`, set `policy.allow_implicit_invocation: false` in the Codex entry's `agents/openai.yaml`. Codex reads that policy before the entry points it to the shared guide. [Architecture skill policy](.agents/skills/improve-codebase-architecture/agents/openai.yaml#L2)
