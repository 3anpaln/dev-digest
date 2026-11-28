# Agent skills

Draft · M2 · 2026-11-26

Written with the project's [`write-spec` skill](../.agents/skills/write-spec/SKILL.md), using both sets of supplied DevDigest mockups as the UI reference.

## Problem and goals

Studio users configure each reviewer's system prompt separately. Shared guidance, such as a PR quality rubric, has to be copied into several agents and can drift when one copy changes.

- Write and maintain one Markdown skill that can be assigned to agents in any workspace.
- Let users choose and order the skills an agent will apply on its next Studio review.
- Let users preview the saved instructions and compare and restore earlier versions.
- Show how often a skill was used and the finding outcomes of those runs in the selected workspace.

## Skills Lab → Skills

Add **Skills** to the Skills Lab navigation. Open the library at `/skills`. Use the mockups' searchable list and selected-skill detail layout. Each row shows the name, short description, type, and enabled state. Show a useful empty state with **Add skill** when the library is empty, and distinguish a search with no matches from a load failure. A selection can be reopened after a refresh or from a direct link.

Each card has an **Enabled** toggle and a **Delete** button independent of card selection. Confirm card actions before applying them. Deleting removes the skill, its saved versions, and its agent assignments. Existing runs keep the skills recorded in their traces. Running the seed can recreate a deleted built-in preset.

If a card action fails, keep the last saved state visible and explain the failure. If the running API lacks the delete endpoint, tell the user to restart the API before retrying.

Use a consistent card height. Show a labeled, color-coded type badge, the current version, and an agent icon with the number of assignments in the selected workspace. Truncate long descriptions on the card and show the full description in a popover on hover or keyboard focus.

Use zero only when the assignment count is known. If the Skills list omits counts, read the current workspace's agent assignments. If both sources are unavailable, show the count as unavailable.

Keep the selected skill's name, type, and current version above the tabs. In Config, use a Markdown source editor with line numbers and a visible unsaved state. In Preview, show the rendered body in the detail pane. In Versions, place **Diff** and **Restore** on older version rows.

Size the Config editor to the available pane and viewport height. Soft-wrap long Markdown lines, including unbroken text, while preserving the source. Keep each line number beside the start of its source line and scroll the editor vertically when the body exceeds its height.

**Add skill** currently opens Config for a new manual skill. All workspaces use the same library, skill IDs, current versions, and enabled states. For the first release, use existing authenticated Studio access for shared library actions. Workspace members with permission to configure an agent can assign an available skill to that agent.

### Add skill dialog (planned)

Use the supplied three-tab dialog. Keep the currently selected skill visible behind it and ask before discarding a draft. On success, close the dialog and open the new skill. A failed load or save keeps the draft available for correction and retry.

| Tab | Behavior |
| --- | --- |
| **Create** | Enter a name, optional description, type, and Markdown body. Reuse the existing manual creation validation. |
| **From file** | Upload one UTF-8 Markdown file or a skill archive. ZIP is the proposed initial archive format. Extract the skill core into an editable draft and suggest a name from supported front matter, the first heading, or the filename. Show the extracted Markdown in Preview before offering **Confirm import**. |
| **Import from URL** | Enter a supported public HTTPS Markdown URL. **Load preview** asks the server to fetch the Markdown once and display it in the same editable preview used for file imports. Treat URL content as untrusted input and require a successful preview before allowing **Confirm import**. On confirmation, save the previewed draft with source `imported_url`. Proposed initial scope is public GitHub Markdown file links and their raw URLs. URL support beyond GitHub is an open decision. |

On both import tabs, show the source, editable fields, and a safe Markdown preview before saving. Apply the current body validation. Save a new skill and version 1 only after the user confirms the import. Save imports disabled and make them available for assignment after a user reviews and explicitly enables them. Explain that enabling an imported skill allows its saved instructions to guide future reviews. Preserve provenance and keep the Markdown snapshot independent of future changes at the source.

For an archive, the skill core is one unambiguous `SKILL.md` at the root or inside a single top-level folder. Extract only that entry's UTF-8 Markdown and recognized metadata. Ignore all other entries, including executable components, scripts, and binaries. They are neither opened for processing nor saved. Read the core without unpacking the archive to disk. Reject archives with missing or ambiguous skill cores, invalid entries, or exceeded size and entry limits. Nested archives are outside the import flow.

Validate the URL and every redirect on the server, keep fetches on approved public destinations, and limit response size and fetch time. Use unauthenticated requests. Treat fetched content as text and reuse the safe Preview renderer. Changing the URL invalidates the previous preview and requires loading the new URL before confirmation. Confirmation saves the reviewed snapshot without fetching the URL again.

Verify that a Markdown file, an archive containing a skill core and executable entries, and a supported URL each load an editable preview. Preview creates zero records. Confirmation creates one disabled skill at version 1, using only the previewed core. For a URL import, also verify that confirmation requires a successful preview for the current URL and that the saved source is `imported_url`. Verify that cancellation, invalid inputs, ambiguous archives, and failed fetches leave the library unchanged. Confirm that the Create tab still supports manual creation.

| Tab | Required behavior |
| --- | --- |
| **Config** | Edit name, description, type (`rubric`, `convention`, `security`, or `custom`), Markdown body, and global enabled state. Use an **Enabled** toggle that takes effect after saving. When saving an enabled-state change, confirm that it affects future runs in all workspaces. Name and body are required after trimming for validation. Preserve the saved Markdown text, including indentation. Show whether changes are unsaved and preserve edits on save failure. Confirm before discarding edits when leaving the current skill. |
| **Preview** | Render the current saved body as Markdown, with its version visible. The preview body corresponds to the text supplied to review prompt assembly. Unsaved Config edits remain a draft and the preview identifies which saved version it displays. Render HTML or executable content inert and avoid automatic external fetches from the Markdown. |
| **Evals** | Show a simple empty state. The populated mockup, including case management, pass counts, and run actions, is a reference for future evaluation work. |
| **Stats** | Show current assignments and 30-day usage, findings by category, and finding accept rate for the selected workspace. |
| **Versions** | List versions newest first with version number, save time, and a **Current** label. Offer a body diff from an older version to the current version and a confirmed restore. |

### Saving and restoring

- Creation saves version 1. Each successful change to the Markdown body creates the next immutable body version and makes it current. Name, description, type, and enabled-state edits save separately from body history, even when submitted together. A save with an identical body does not add a version.
- Restore copies the chosen version's body into a new current version. It preserves the history, current metadata, enabled state, and agent assignments. Identify the source version in the restore confirmation. Prevent a stale edit or restore from silently overwriting a more recent save, and let the user recover their draft after a conflict.

## Agents → Skills

Show the saved skill assignment count on each agent card in both the Agents list and the editor sidebar. Include saved assignments for disabled skills in that count. On the Skills tab, show separate assigned and enabled totals. Group available skills by type and use the same type colors as the Skills library. Keep assigned skills in a single prompt-order list so users can reorder skills across types.

Add a **Skills** tab alongside **Config** for each agent. List skills from the global library with an assignment toggle, name, type, and availability. The toggle updates the draft assignment. **Save changes** applies the updated assignments and order to future runs. Show a filter and an effective skill count above the list. The count reflects the full list. Newly selected skills go at the end of the agent's draft order.

### Drag and drop

- Show a drag handle on each selected skill. Let users drag it up or down and show the insertion point before dropping. A successful drop updates the draft order and keeps the selection intact. An unselected row has no active drag handle. Earlier selected skills appear earlier in the assembled review prompt when enabled.
- Provide keyboard-accessible **Move up** and **Move down** actions with the same effect. Keep focus on the moved skill and announce its new position among the selected skills. Cancelling a drag leaves the draft order intact.
- While filtering, keep selection controls available and pause reorder controls. Show **Clear the filter to reorder skills** so users can see the full order before moving a skill. Filtering preserves hidden selections and their order.

Use **Save changes** to persist the ordered selection as a whole. A failed save leaves the previous selection in effect and keeps the draft available for retry. Display the count of effective skills and identify any selected skill that is disabled. Disabling a skill excludes it from future reviews while retaining its assignments. Users can remove a disabled skill, and re-enabling it makes existing assignments effective again in their saved positions.

## What “next run” means

- A run uses the agent's last saved skill order and each selected, enabled skill's current saved body when the server creates that run. This applies to individual Studio reviews, reruns, and each agent in **Run all**. A saved selection applies to every subsequent run until the user deselects it and saves. Disabling a shared skill pauses its use while retaining the selection.
- Keep an ordered record of skill IDs and exact version numbers with each run. The run uses that snapshot through background execution and model retries. Once the run exists, a save, reorder, disable, or restore applies to subsequent runs. An agent with zero effective skills runs with its existing prompt behavior.
- The run trace shows **Skills used**, with the names and versions captured in prompt order for that run.
- On the first model dispatch, the live and saved run logs report the number of skills in the prompt, including zero. Later chunks and retries do not repeat the entry.
- Supply skill bodies once per assembled review prompt, in saved order, using the shared review engine. Apply the same order to each review chunk that uses the shared prompt. Skills from the global library provide review guidance. Existing system rules, structured output, grounding, and the boundaries around PR and repository input still apply.
- Shared skill links use existing authenticated Studio access. Agent assignments, review runs, and Stats data require access to their workspace. If the saved configuration cannot be resolved because of an error, report the affected agent's run failure and keep other agents eligible to run.

## Stats

A review can use several skills. Its findings and acceptance decisions are recorded against the run, so they cannot establish which skill influenced a particular finding. Label the outcome metrics as results from runs that used the skill. A finding can appear on several skill pages when those skills were used in the same run.

Use a rolling 30-day window for runs and findings, scoped to the selected workspace. Count each Studio run once by its first recorded dispatch. Exclude historical runs without recorded skill usage. When there is no recorded usage, show zero runs and findings with an empty chart. Distinguish an unavailable Stats response from a known zero.

| Display | Definition |
| --- | --- |
| **Assigned agents** | Current count and list of agents in the selected workspace linked to the skill, including disabled agents. Show each assignment's effective status and link to the agent's Skills tab. |
| **Runs with skill (30d)** | Number of distinct Studio agent runs whose review prompt was dispatched with this skill. Runs that fail or are cancelled after dispatch contribute to this count. |
| **Findings on those runs (30d)** | Number of saved findings from the corresponding completed runs and their breakdown by category. Use finding counts in the chart legend. |
| **Finding accept rate (30d)** | Accepted findings divided by accepted plus dismissed findings from those completed runs, using the current finding disposition. Pending findings are excluded. Display a dash with an explanation when no finding has been triaged. |

Use **Runs with skill** as the usage label. Assigned and enabled skills are applied on every eligible run.

## Acceptance criteria

1. A signed-in Studio user creates a manual skill with a name, type, and Markdown body. The same skill appears in two workspaces, opens all five tabs, shows the saved body in Preview, and starts with v1 in Versions. A blank name or body is rejected. Evals shows its placeholder.
2. Saving a body edit creates v2. A metadata-only save adds no body version. The diff shows the v1-to-v2 body changes. Restoring v1 creates v3 with v1's body and preserves v2 and existing assignments. A stale editor receives a conflict and can recover its draft.
3. Editors in two workspaces can assign the same skill independently. An editor saves two skills in a chosen order, filters the list, and reloads. Both selections and their order persist. An editor with access to only one workspace cannot read or change the other workspace's agent assignments or view its runs or Stats data.
4. Start a Studio review with A's ordered selection. Before background execution, change one skill body and disable the other. The original run uses the original versions in the original order, and **Skills used** in its trace shows those versions in order. A subsequent rerun uses the new body and skips the disabled skill. Re-enabling restores the saved assignment at its previous position. Verify the prompt and recorded versions with a stub model.
5. Run the same agent twice after saving a skill selection. Both runs receive the selected skill. Deselect and save it for that agent. Later runs for that agent omit it, while an agent with the same skill assigned in another workspace continues to receive it.
6. An agent with no effective skills still runs successfully with its normal prompt. If one agent's saved configuration cannot be resolved during **Run all**, its failure is visible and the other selected agents can complete.
7. With skills A, B, and C selected in that order, drag C by its handle above A. The insertion indicator appears and the draft order becomes C, A, B. A review started before saving still uses A, B, C. After **Save changes** and a reload, the tab and the next review prompt both use C, A, B. Keyboard moves produce the same order changes and announce the new position. Cancelling a drag or applying and clearing a filter preserves the order.
8. In Workspace A, one completed run dispatches three model requests using two skills and saves one accepted, one dismissed, and one pending finding. Each skill page in A shows one run, three findings, and a 50% finding accept rate. The same skill pages in Workspace B exclude A's run and findings. A run with only pending findings shows a dash for accept rate.
9. With skill A open, turn off skill B from its card and confirm. The detail pane stays on A, and the next run of an agent assigned to B skips it. Cancel a delete confirmation to keep B. Confirm deletion to remove B from the library and its agent assignments. Earlier run traces still show B where it was used.
10. An agent with one saved skill displays **1 skill** on both agent cards. Add a skill of another type and save. The cards show **2 skills**. Both skills appear in **Prompt order** and can be reordered across types. Unassigned skills appear under their color-coded type groups.

## Scope decisions and proposed improvements

- **Global skill library.** A skill is a Markdown instruction body. Manual authoring is available today. The planned Add skill dialog covers Markdown files, skill cores extracted from archives, and Markdown URL imports. The [Conventions Extractor](conventions-extractor.md) defines repository-based creation and workspace visibility. Community search and importing supporting files, scripts, or tool permissions are deferred.
- **Studio reviews.** CI distribution, executable evals, and automatic skill selection are deferred. The **Evals** tab is a placeholder.
- **Global library permissions.** Add a dedicated permission for creating, editing, disabling, and restoring global skills in a later release. Keep management of an agent's assignments under that workspace's permissions.
- **Cross-workspace Stats.** Defer shared aggregates and the permission to view them. The initial Stats tab uses the selected workspace.

## Implementation references and verification

New skills are global and use an internal owner in the existing workspace table. Private skills and their assignments keep their original workspace. Missing legacy body versions are captured on the next body edit. The [Studio run lifecycle](../server/specs/review-runs.md) creates run IDs before background work. The existing run trace stores the skill snapshot and first model dispatch time.

Use a seeded browser flow for creating and previewing a skill, then assigning, dragging, saving, and reloading the agent's skill order. Use a server integration check for shared library access and workspace isolation of assignments, and a stub model to verify the effective prompt across individual and multi-agent runs. The acceptance criteria are the initial release targets.
