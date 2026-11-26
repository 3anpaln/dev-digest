# DevDigest

Use Node.js 22 and TypeScript 5. Install dependencies in the package that owns the lockfile. The four packages share this repository and resolve shared source through TypeScript path aliases.

## Repository map and commands

Read the linked package instructions before editing that package. Run the commands below from the indicated directory.

| Directory | Stack and responsibility | Run or build | Test |
| --- | --- | --- | --- |
| [client/](client/AGENTS.md) | Next.js 15, React 19, TanStack Query 5. Web studio on port 3000. | `pnpm dev` or `pnpm build` | `pnpm test` |
| [server/](server/AGENTS.md) | Fastify 5, Zod 3, Drizzle, PostgreSQL 16 with pgvector. API and indexing on port 3001. | `pnpm dev` | `pnpm test` (DB tests need Docker) |
| [reviewer-core/](reviewer-core/AGENTS.md) | Review engine consumed as TypeScript source by the API. | `npm run build` (typecheck) | `npm test` |
| [e2e/](e2e/AGENTS.md) | Deterministic browser flows using agent-browser. | Start the seeded stack | `npm test` |

From the root, run `bash scripts/dev.sh` for the full stack. Use pnpm 10 for the client and server to match CI.

## Naming and ownership

- Place Fastify feature entry points in `server/src/modules/<feature>/routes.ts`. Register them in the module registry.
- Name DB-backed server tests `*.it.test.ts`, other server tests `*.test.ts`, client component tests `*.test.tsx`, and browser flows `NN-name.flow.json`.
- When changing a shared API shape, check both vendored copies. Read [cross-package insights](insights.md) for their locations and consumers.

## Do not touch

- Preserve existing files in `server/src/db/migrations/`, including SQL migrations and snapshots. Add a new migration and append its journal entry for schema changes.
- Keep real keys in local settings or environment files. Use `.env.example` for tracked configuration examples.
- Keep application edits out of imported checkouts (`server/clones/` by default), installed dependencies (`node_modules/`), and generated output (`.next/`, `dist/`, `coverage/`, `test-results/`).

## Read when

- For cross-package changes, read **Architecture** in the [project README](README.md).
- For route changes, open the [server README](server/README.md) and read **API map (starter)**. For indexing changes, read the [repo-intel reference](server/src/modules/repo-intel/README.md).
- Read the [specs index](specs/README.md) for acceptance criteria and [TESTING.md](TESTING.md) for CI coverage. Follow the affected package’s links for local docs and insights.

## Task completion

For a manual PR self review, use the [PR Self Review skill](.claude/skills/pr-self-review/SKILL.md). When asked to open a GitHub PR, use `node scripts/pr-open.mjs --base <target-branch>` from the root.

After verification and before the final response for each task, follow the [engineering-insights skill](.claude/skills/engineering-insights/SKILL.md).
