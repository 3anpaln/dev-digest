"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { ConventionSkillDraft } from "@devdigest/shared";
import { Button } from "@devdigest/ui";
import { ApiError } from "../../../../../lib/api";
import { loadConventionDraft, useSaveConventionSkill } from "../../../../../lib/hooks/conventions";
import styles from "./conventions.module.css";

type Fields = Pick<ConventionSkillDraft, "name" | "description" | "body">;

export function CreateConventionSkillDialog({ repoId, branch, repository, initial, opener, onClose }: {
  repoId: string;
  branch: string;
  repository: string;
  initial: ConventionSkillDraft;
  opener: HTMLButtonElement | null;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const save = useSaveConventionSkill(repoId, branch);
  const [requestId] = useState(() => globalThis.crypto.randomUUID());
  const [source, setSource] = useState(initial);
  const [edits, setEdits] = useState<Partial<Fields>>({});
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState("");
  const [refreshed, setRefreshed] = useState(false);
  const fields = { name: source.name, description: source.description, body: source.body, ...edits };
  const dirty = fields.name !== source.name || fields.description !== source.description || fields.body !== source.body;
  const busy = refreshing || save.isPending;
  const conflict = save.error instanceof ApiError && save.error.code === "conventions_changed";

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => {
      element?.close();
      if (opener?.isConnected) opener.focus();
    };
  }, [opener]);

  useEffect(() => {
    if (!dirty) return;
    function warn(event: BeforeUnloadEvent) { event.preventDefault(); }
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function discard() {
    if (!busy && (!dirty || window.confirm("Discard your unsaved skill draft?"))) onClose();
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || conflict || !fields.name.trim() || !fields.body.trim()) return;
    save.mutate({ ...fields, revision: source.revision, requestId }, {
      onSuccess: (skill) => {
        onClose();
        router.push("/skills?skill=" + encodeURIComponent(skill.id));
      },
    });
  }

  async function refresh() {
    setRefreshing(true);
    setRefreshError("");
    try {
      const next = await loadConventionDraft(repoId, branch);
      setEdits({
        ...(fields.name !== source.name ? { name: fields.name } : {}),
        ...(fields.description !== source.description ? { description: fields.description } : {}),
        ...(fields.body !== source.body ? { body: fields.body } : {}),
      });
      setSource(next);
      setRefreshed(true);
      save.reset();
    } catch (error) {
      setRefreshError(error instanceof Error ? error.message : "Could not refresh the accepted findings.");
    } finally {
      setRefreshing(false);
    }
  }

  return <dialog ref={dialog} className={styles.dialog} aria-labelledby="convention-skill-title" onCancel={(event) => {
    event.preventDefault();
    discard();
  }}>
    <h2 id="convention-skill-title">Create skill from conventions</h2>
    <p className={styles.source}>From {source.accepted_count} accepted {source.accepted_count === 1 ? "convention" : "conventions"} in <strong>{repository}</strong>.</p>
    <form className={styles.form} onSubmit={submit} aria-busy={busy}>
      <label>Name<input autoFocus required maxLength={200} value={fields.name} disabled={busy}
        onChange={(event) => setEdits({ ...edits, name: event.target.value })} /></label>
      <label>Description<input maxLength={4000} value={fields.description} disabled={busy}
        onChange={(event) => setEdits({ ...edits, description: event.target.value })} /></label>
      <label>Markdown body<textarea required rows={9} maxLength={100_000} value={fields.body} disabled={busy} spellCheck={false}
        onChange={(event) => setEdits({ ...edits, body: event.target.value })} /></label>
      {refreshed && edits.body !== undefined && <details>
        <summary>View the refreshed Markdown</summary>
        <pre className={styles.refreshed}>{source.body}</pre>
        <Button type="button" disabled={busy} onClick={() => setEdits({ ...edits, body: source.body })}>Use refreshed Markdown</Button>
      </details>}
      {save.error && <p className={styles.error} role="alert">{save.error.message}</p>}
      {refreshError && <p className={styles.error} role="alert">{refreshError}</p>}
      {conflict && <div><Button type="button" loading={refreshing} onClick={() => void refresh()}>Refresh source</Button></div>}
      <div className={styles.cardFooter}>
        <span className={styles.scope}>Version 1 · Starts disabled in {source.workspace_name ?? "the source workspace"}</span>
        <div className={styles.actions}>
          <Button type="button" disabled={busy} onClick={discard}>Cancel</Button>
          <Button type="submit" kind="primary" icon="Sparkles" loading={save.isPending}
            disabled={busy || conflict || !fields.name.trim() || !fields.body.trim()}>Create skill</Button>
        </div>
      </div>
    </form>
  </dialog>;
}
