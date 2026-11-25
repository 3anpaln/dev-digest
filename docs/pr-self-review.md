# PR Self Review

Version 1.0.0 reviews local changes on demand and before the repository's PR-opening command. A separately installed GitHub App enforces the same critical threshold for the protected branch, including PRs opened in the browser.

## Local use

Use Node.js 22 and Git. Set `OPENAI_API_KEY` and `PR_SELF_REVIEW_MODEL` in the runner environment to select an approved OpenAI model supporting Chat Completions JSON output. Review sends changed code, repository paths, project guides and requested source context to that provider. The runner requests no provider-side storage.

| Action | From the repository root |
| --- | --- |
| Manual in Codex | `$pr-self-review` |
| Manual in a shell | `node scripts/pr-self-review.mjs --base origin/main` |
| Review and open a PR on the pushed feature branch | `node scripts/pr-open.mjs --base main` |
| Run the offline fixture suite | `node --test scripts/self-review/self-review.test.mjs` |

The opening command requires an authenticated GitHub CLI, an up-to-date remote target ref and a published head in the same GitHub repository as `origin`. It checks the remote revisions and pending snapshots again before calling `gh pr create`. Manual review leaves opening the PR to the caller.

## What gets reviewed

The runner compares the merge base with the committed candidate, the staged tree when different, and the working tree when different from the index. It builds temporary Git objects and a separate index to include non-ignored untracked files. Renames appear as removal and addition so both paths receive coverage. Each review uses complete blobs from the named tree and may request additional callers and contracts. Unsupported binary data, credentials, unreadable content and exceeded context limits produce an incomplete result.

Each report records the base, head, tree, policy fingerprint, per-file skills, findings, verified resolutions and coverage gaps. A missing specialist guide is a coverage gap. Ship the canonical project guides with the trusted runner, including `.claude/skills/frontend-architecture/SKILL.md` and `.claude/skills/tanstack-query-best-practices/SKILL.md` for UI and cache changes. Each package's committed instructions and the relevant specialist guides supply review criteria. Candidate changes to the gate or skill guides are reviewed as data by the hosted installation.

| Verdict | Exit | Meaning |
| --- | --- | --- |
| Pass | 0 | All changed files were reviewed and zero confirmed criticals remain. |
| Blocked | 1 | At least one confirmed critical remains. |
| Incomplete | 2 | Configuration, coverage, verification or review execution prevented a pass. |

Blockers carry stable IDs and persist across runs. A proposed fix needs fresh evidence in a changed tree. The hosted runner also shares known blockers for identical candidate trees across PR numbers. Local state lives under the ignored `.devdigest/cache/pr-self-review/`. If a local process is killed, confirm it has exited before removing its empty `running` directory there.

## Activate the GitHub merge check

1. Install a GitHub App scoped to the repository. Grant read access to contents and pull requests and write access to commit statuses. Subscribe to pull request events, and to merge group events when using a merge queue. Configure a webhook secret and an HTTPS endpoint forwarding to the service. [GitHub webhook events](https://docs.github.com/en/webhooks/webhook-events-and-payloads) · [Commit status permissions](https://docs.github.com/en/rest/commits/statuses#create-a-commit-status)
2. Run one instance of `node scripts/self-review/github-app.mjs` from a trusted release containing the code and skills. Configure `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY_FILE`, `GITHUB_WEBHOOK_SECRET`, `PR_REVIEW_REPO` (owner/repository), the model settings above, and `PR_REVIEW_STATE_DIR` on a private durable volume dedicated to this installation. `PR_REVIEW_BASE` defaults to `main`. The service listens on loopback port 3002 or `PORT`. Preserve the volume through upgrades.
3. Open a test PR against the configured branch. The service validates GitHub's webhook signature, reads the event's immutable base and head into a temporary bare repository, and posts a commit status named **PR Self Review**. It reads candidate source as data. The trusted worker writes the full report under `PR_REVIEW_STATE_DIR/<head-sha>.json`. Redeliver the webhook to retry an incomplete review after restoring a missing guide or provider.
4. Once GitHub has seen a successful check, activate a ruleset on the target branch. Require a pull request, require **PR Self Review** from this specific App, require an up-to-date branch or use the merge queue, and leave the bypass list empty for users subject to the gate. Verify direct web PRs and a fixed successor commit with the ruleset active. A repository administrator must activate this rule for GitHub to prevent merges. [GitHub rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets#require-status-checks-to-pass-before-merging)
