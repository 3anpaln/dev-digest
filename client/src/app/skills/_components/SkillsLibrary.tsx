"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Badge, Button, Icon, Markdown, Tabs, Toggle } from "@devdigest/ui";
import type { EditableSkill } from "@devdigest/shared";
import { AppShell } from "../../../components/app-shell";
import { SKILL_TYPES, SkillTypeBadge } from "../../../components/SkillTypeBadge";
import { ApiError } from "../../../lib/api";
import { useSaveSkill, useSkillCardAction, useSkills, type SkillFields } from "../../../lib/hooks/skills";
import { AddSkillDialog } from "./AddSkillDialog";
import { SkillHistory } from "./SkillHistory";
import { SkillCardDescription } from "./SkillCardDescription";
import { SkillStats } from "./SkillStats";
import styles from "./skills.module.css";

const tabs = [
  { key: "config", label: "Config" },
  { key: "preview", label: "Preview" },
  { key: "evals", label: "Evals" },
  { key: "stats", label: "Stats" },
  { key: "versions", label: "Versions" },
];
const initial: SkillFields = { name: "", description: "", type: "custom", body: "", enabled: true };
const crumb = [{ label: "Skills Lab" }, { label: "Skills" }];

function importSource(skill: EditableSkill) {
  if (skill.source === "imported_file" || skill.source === "imported_url") return skill.evidence_files?.[0];
}

function enableWarning(skill: EditableSkill, enabled: boolean) {
  return enabled && importSource(skill) ? " Review the imported instructions in Preview before enabling." : "";
}

export function SkillsLibrary() {
  const library = useSkills();
  const router = useRouter();
  const params = useSearchParams();
  const save = useSaveSkill();
  const cardAction = useSkillCardAction();
  const [filter, setFilter] = useState("");
  const [adding, setAdding] = useState(false);
  const [pendingDraft, setDraft] = useState<{ key: string; fields: Partial<SkillFields>; base?: EditableSkill } | null>(null);
  const key = params.get("skill");
  const isNew = key === "new";
  const skill = isNew ? undefined : library.data?.find((item) => item.id === key) ?? (key ? undefined : library.data?.[0]);
  const draftKey = isNew ? "new" : skill?.id;
  const draft = pendingDraft?.key === draftKey ? pendingDraft : null;
  const tab = !isNew && tabs.some((item) => item.key === params.get("tab")) ? params.get("tab")! : "config";
  const fields = { ...initial, ...(draft ? draft.base : skill), ...draft?.fields };
  const hasDraft = draft !== null;
  const conflict = save.error instanceof ApiError && save.error.status === 409;

  useEffect(() => {
    if (!hasDraft) return;
    function warn(event: BeforeUnloadEvent) { event.preventDefault(); event.returnValue = ""; }
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [hasDraft]);

  function go(id: string, nextTab = "config") {
    router.replace(`/skills?${new URLSearchParams({ skill: id, tab: nextTab })}`);
  }

  function select(id: string) {
    if (save.isPending || cardAction.isPending || (hasDraft && !window.confirm("Discard your unsaved skill changes?"))) return;
    setDraft(null);
    save.reset();
    go(id);
  }

  function edit(change: Partial<SkillFields>) {
    if (draftKey) setDraft({ key: draftKey, base: draft ? draft.base : skill, fields: { ...draft?.fields, ...change } });
  }

  function changeCard(item: EditableSkill, enabled?: boolean) {
    const confirmed = enabled === undefined
      ? window.confirm(`Permanently delete "${item.name}"? This removes its saved versions and agent assignments. Existing runs keep their recorded skills.`)
      : window.confirm(`${enabled ? "Enable" : "Disable"} "${item.name}" for future runs? Shared skills affect all workspaces.${enableWarning(item, enabled)}`);
    if (!confirmed) return;
    cardAction.mutate({ skill: item, enabled }, {
      onSuccess: (updated) => {
        if (updated === null && key === item.id) router.replace("/skills");
      },
    });
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (cardAction.isPending) return;
    const current = draft ? draft.base : skill;
    const { name, description, type, body, enabled } = fields;
    if (!name.trim() || !body.trim() || (current && !hasDraft)) return;
    if (current && current.enabled !== enabled
      && !window.confirm(`This changes whether the skill is used on future runs in all workspaces. Continue?${enableWarning(current, enabled)}`)) return;
    save.mutate({ fields: { name, description, type, body, enabled }, current }, { onSuccess: (saved) => {
      setDraft(null);
      go(saved.id);
    } });
  }

  const matches = library.data?.filter((item) =>
    `${item.name} ${item.description} ${item.type}`.toLowerCase().includes(filter.trim().toLowerCase())) ?? [];

  return (
    <AppShell crumb={crumb}>
      <div className={styles.layout}>
        <aside className={styles.library} aria-label="Skills library">
          <div className={styles.heading}>
            <h1>Skills</h1>
            <Button kind="primary" size="sm" icon="Plus" disabled={save.isPending || cardAction.isPending} onClick={() => {
              if (hasDraft && !window.confirm("Discard your unsaved skill changes?")) return;
              setDraft(null);
              save.reset();
              setAdding(true);
            }}>Add skill</Button>
          </div>
          <input type="search" aria-label="Search skills" placeholder="Search skills…" value={filter}
            onChange={(event) => setFilter(event.target.value)} />
          {library.isPending && <p role="status">Loading skills…</p>}
          {library.isError && <p role="alert">Could not load skills. <Button onClick={() => void library.refetch()}>Retry</Button></p>}
          {cardAction.isError && <p role="alert">{cardAction.error.message}</p>}
          {library.isSuccess && matches.length === 0 && <p>{library.data.length ? "No matching skills." : "No skills yet."}</p>}
          <ul className={styles.cards}>
            {matches.map((item) => {
              const isSelected = item.id === skill?.id;
              const hasUnsavedEdits = isSelected && hasDraft;
              const disabled = save.isPending || cardAction.isPending || hasUnsavedEdits;
              return <li key={item.id} className={styles.card} data-active={isSelected || undefined}>
                <button className={styles.cardSelect} type="button" aria-current={isSelected ? "true" : undefined}
                  onClick={() => { if (item.id !== skill?.id) select(item.id); }}>
                  <strong title={item.name}>{item.name}</strong>
                </button>
                <SkillCardDescription name={item.name} description={item.description} />
                <div className={styles.cardMeta}>
                  <SkillTypeBadge type={item.type} />
                  <span>v{item.version}</span>
                  <span title={item.assigned_agents_count === null ? "Agent count unavailable" : undefined}>
                    <Icon.Cpu size={12} aria-hidden="true" />
                    {item.assigned_agents_count === null
                      ? "— agents"
                      : `${item.assigned_agents_count} ${item.assigned_agents_count === 1 ? "agent" : "agents"}`}
                  </span>
                </div>
                <div className={styles.cardActions} title={hasUnsavedEdits ? "Save or discard Config changes first" : undefined}>
                  <Toggle label={`Enable ${item.name}`} size={14} on={item.enabled} disabled={disabled}
                    onChange={(enabled) => changeCard(item, enabled)} />
                  <button type="button" aria-label={`Delete ${item.name}`} disabled={disabled}
                    onClick={() => changeCard(item)}>
                    <Icon.Trash size={15} aria-hidden="true" />
                  </button>
                </div>
              </li>;
            })}
          </ul>
        </aside>
        <main className={styles.detail}>
          {skill || isNew ? <>
            <header className={styles.detailHeader}>
              <div className={styles.heading}>
                <h2>{skill?.name ?? "New skill"}</h2>
                {skill && <><SkillTypeBadge type={skill.type} /><Badge color="var(--text-secondary)">v{skill.version}</Badge></>}
              </div>
              {!isNew && <Tabs tabs={tabs} value={tab} onChange={(next) => go(skill!.id, next)} />}
            </header>
            <div className={styles.content}>
              {tab === "config" && (
                <form className={styles.form} onSubmit={submit}>
                  <div className={styles.heading}>
                    <h3>Configuration</h3>
                    <div className={styles.enabled}>
                      <span>Enabled</span>
                      <Toggle label="Enabled" on={fields.enabled} disabled={save.isPending}
                        onChange={(enabled) => edit({ enabled })} />
                    </div>
                  </div>
                  <label>Name <input required maxLength={200} value={fields.name} disabled={save.isPending} onChange={(event) => edit({ name: event.target.value })} /></label>
                  <label>Description <input maxLength={4000} value={fields.description} disabled={save.isPending} onChange={(event) => edit({ description: event.target.value })} /></label>
                  <label>Type <select value={fields.type} disabled={save.isPending} onChange={(event) => edit({ type: event.target.value as SkillFields["type"] })}>
                    {SKILL_TYPES.map((type) => <option key={type}>{type}</option>)}
                  </select></label>
                  <div>
                    <label htmlFor="skill-body">Skill body (Markdown)</label>
                    <div className={styles.editor}>
                      <div className={styles.editorHeader}>
                        <Icon.FileText size={15} aria-hidden="true" />
                        <span>{fields.name.trim() || "skill"}.md</span>
                        {hasDraft && <Badge color="var(--text-secondary)">Unsaved</Badge>}
                      </div>
                      <div className={styles.editorBody}>
                        <div className={styles.editorCanvas}>
                          {/* Match the textarea's wrapping so each number stays on its source line. */}
                          <div aria-hidden="true" className={styles.lineLayout}>
                            {fields.body.split("\n").map((line, index) => (
                              <div key={index} className={styles.sourceLine}>
                                <span className={styles.lineNumber}>{index + 1}</span>
                                <span className={styles.lineMeasure}>{line || "\u00a0"}</span>
                              </div>
                            ))}
                          </div>
                          <textarea id="skill-body" required maxLength={100_000} value={fields.body} disabled={save.isPending}
                            onChange={(event) => edit({ body: event.target.value })} wrap="soft" spellCheck={false} />
                        </div>
                      </div>
                    </div>
                  </div>
                  {save.isError && <p role="alert">{save.error.message}</p>}
                  {conflict && <Button type="button" onClick={async () => {
                    const latest = (await library.refetch()).data?.find((item) => item.id === skill?.id);
                    if (latest) {
                      setDraft((previous) => previous && { ...previous, base: latest });
                      save.reset();
                    }
                  }}>Load latest and keep my edits</Button>}
                  <div>
                    <Button type="submit" kind="primary" disabled={save.isPending || conflict || !hasDraft || !fields.name.trim() || !fields.body.trim()}>
                      {save.isPending ? "Saving…" : isNew ? "Create skill" : "Save changes"}
                    </Button>
                  </div>
                </form>
              )}
              {tab === "preview" && skill && <section>
                <h3>Preview <small>v{skill.version}</small></h3>
                <p className={styles.hint}>Saved instructions used in review prompts.</p>
                {importSource(skill) && <p className={styles.importSource}>Source <b>{importSource(skill)}</b></p>}
                <div className={styles.markdown}>
                  <Markdown skipHtml>{skill.body}</Markdown>
                </div>
              </section>}
              {tab === "evals" && <section><h3>Evals</h3><p className={styles.hint}>No evaluation cases yet.</p></section>}
              {tab === "stats" && skill && <SkillStats id={skill.id} enabled={skill.enabled} />}
              {tab === "versions" && skill && <SkillHistory key={skill.id} skill={skill} hasDraft={hasDraft} />}
            </div>
          </> : library.isSuccess && (
            <div className={styles.content}><h2>{key ? "Skill not found" : "No skills yet"}</h2>
              <p className={styles.hint}>{key ? "Select a skill from the library." : "Add a Markdown skill to share review guidance."}</p>
            </div>
          )}
        </main>
      </div>
      {adding && <AddSkillDialog onClose={() => setAdding(false)} onSaved={(saved) => {
        setAdding(false);
        go(saved.id);
      }} />}
    </AppShell>
  );
}
