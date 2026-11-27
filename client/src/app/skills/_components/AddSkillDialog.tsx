"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { EditableSkill, SkillImportDraft, SkillImportPreview } from "@devdigest/shared";
import { Button, Markdown } from "@devdigest/ui";
import { SKILL_TYPES } from "../../../components/SkillTypeBadge";
import { useConfirmSkillImport, useSaveSkill, useSkillImportPreview } from "../../../lib/hooks/skills";
import styles from "./skills.module.css";

const modes = [
  { key: "create", label: "Create" },
  { key: "file", label: "From file" },
  { key: "url", label: "Import from URL" },
] as const;
type Mode = (typeof modes)[number]["key"];
const empty: SkillImportDraft = { name: "", description: "", type: "custom", body: "" };

function readBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",", 2)[1] ?? "");
    reader.onerror = () => reject(new Error("Could not read the selected file."));
    reader.readAsDataURL(file);
  });
}

export function AddSkillDialog({ onClose, onSaved }: { onClose: () => void; onSaved: (skill: EditableSkill) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [mode, setMode] = useState<Mode>("create");
  const [fields, setFields] = useState(empty);
  const [file, setFile] = useState<File>();
  const [url, setUrl] = useState("");
  const [preview, setPreview] = useState<SkillImportPreview>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const manual = useSaveSkill();
  const load = useSkillImportPreview();
  const confirm = useConfirmSkillImport();
  const busy = loading || manual.isPending || confirm.isPending;
  const dirty = Boolean(file || url || fields.name || fields.description || fields.body || fields.type !== empty.type);
  const canSave = Boolean((mode === "create" || preview) && fields.name.trim() && fields.body.trim());

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  useEffect(() => {
    if (!dirty) return;
    function warn(event: BeforeUnloadEvent) { event.preventDefault(); }
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function canDiscard() {
    return !busy && (!dirty || window.confirm("Discard your unsaved skill draft?"));
  }

  function switchMode(next: Mode) {
    if (next === mode || !canDiscard()) return;
    setFields(empty);
    setFile(undefined);
    setUrl("");
    setPreview(undefined);
    setError("");
    setMode(next);
  }

  function resetPreview() {
    setPreview(undefined);
    setFields(empty);
    setError("");
  }

  async function loadPreview() {
    if (busy || (mode === "file" && !file) || (mode === "url" && !url.trim())) return;
    if (file && (file.size === 0 || file.size > 512 * 1024)) {
      setError("Choose a nonempty Markdown file or ZIP up to 512 KB.");
      return;
    }
    resetPreview();
    setLoading(true);
    try {
      const result = await load.mutateAsync(mode === "file" && file
        ? { kind: "file", filename: file.name, content: await readBase64(file) }
        : { kind: "url", url: url.trim() });
      setFields(result.draft);
      setPreview(result);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not load the import preview.");
    } finally {
      setLoading(false);
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mode !== "create" && !preview) {
      await loadPreview();
      return;
    }
    if (busy || !canSave) return;
    setError("");
    try {
      if (mode === "create") onSaved(await manual.mutateAsync({ fields: { ...fields, enabled: true } }));
      else if (preview) onSaved(await confirm.mutateAsync({ token: preview.token, fields }));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not save the skill.");
    }
  }

  return (
    <dialog ref={dialog} className={styles.addDialog} aria-labelledby="add-skill-title" onCancel={(event) => {
      event.preventDefault();
      if (canDiscard()) onClose();
    }}>
      <header className={styles.heading}>
        <h2 id="add-skill-title">Add skill</h2>
        <Button type="button" icon="X" aria-label="Close Add skill" disabled={busy} onClick={() => { if (canDiscard()) onClose(); }} />
      </header>
      <div className={styles.importModes} role="group" aria-label="Skill creation method">
        {modes.map(({ key, label }) => (
          <button type="button" key={key} aria-pressed={key === mode} disabled={busy} onClick={() => switchMode(key)}>{label}</button>
        ))}
      </div>
      <form className={styles.form} onSubmit={save} aria-busy={busy}>
        {mode === "file" && <label>Markdown file or ZIP archive
          <input type="file" accept=".md,.markdown,.zip" disabled={busy} onChange={(event) => {
            setFile(event.target.files?.[0]);
            resetPreview();
          }} />
        </label>}
        {mode === "url" && <label>Public GitHub Markdown URL
          <input type="url" maxLength={2048} value={url} disabled={busy} placeholder="https://github.com/…/blob/…/SKILL.md"
            onChange={(event) => { setUrl(event.target.value); resetPreview(); }} />
        </label>}
        {mode !== "create" && !preview && <div>
          <Button type="submit" kind="primary" disabled={busy || (mode === "file" ? !file : !url.trim())}>
            {loading ? "Loading preview…" : "Load preview"}
          </Button>
        </div>}
        {(mode === "create" || preview) && <>
          {preview && <p className={styles.importSource}>Source <b>{preview.reference}</b></p>}
          <label>Name
            <input id="add-skill-name" required maxLength={200} value={fields.name} disabled={busy}
              onChange={(event) => setFields({ ...fields, name: event.target.value })} />
          </label>
          <label>Description
            <input maxLength={4000} value={fields.description} disabled={busy}
              onChange={(event) => setFields({ ...fields, description: event.target.value })} />
          </label>
          <label>Type
            <select value={fields.type} disabled={busy} onChange={(event) => setFields({ ...fields, type: event.target.value as SkillImportDraft["type"] })}>
              {SKILL_TYPES.map((type) => <option key={type}>{type}</option>)}
            </select>
          </label>
          <label>Skill body (Markdown)
            <textarea id="add-skill-body" required maxLength={100_000} value={fields.body} disabled={busy} rows={6}
              wrap="soft" spellCheck={false} onChange={(event) => setFields({ ...fields, body: event.target.value })} />
          </label>
        </>}
        {preview && <section aria-labelledby="import-preview-title">
          <h3 id="import-preview-title">Preview</h3>
          <p className={styles.hint}>Review these instructions before saving. Imported skills start disabled.</p>
          <div className={styles.markdown}><Markdown skipHtml>{fields.body}</Markdown></div>
        </section>}
        {error && <p role="alert">{error}</p>}
        {(mode === "create" || preview) && <Button type="submit" kind="primary" disabled={busy || !canSave}>
          {busy ? "Saving…" : mode === "create" ? "Create skill" : "Confirm import"}
        </Button>}
      </form>
    </dialog>
  );
}
