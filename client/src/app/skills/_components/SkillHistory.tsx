"use client";

import { useState } from "react";
import { useFormatter } from "next-intl";
import { Badge, Button } from "@devdigest/ui";
import type { EditableSkill, SkillVersion } from "@devdigest/shared";
import { useRestoreSkill, useSkillVersions } from "../../../lib/hooks/skills";
import { ApiError } from "../../../lib/api";
import styles from "./skills.module.css";

function changedLines(older: string, current: string) {
  const before = older.split("\n");
  const after = current.split("\n");
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start++;
  let endBefore = before.length;
  let endAfter = after.length;
  while (endBefore > start && endAfter > start && before[endBefore - 1] === after[endAfter - 1]) {
    endBefore--;
    endAfter--;
  }
  return { start, removed: before.slice(start, endBefore), added: after.slice(start, endAfter) };
}

export function SkillHistory({ skill, hasDraft }: { skill: EditableSkill; hasDraft: boolean }) {
  const versions = useSkillVersions(skill.id);
  const restore = useRestoreSkill();
  const format = useFormatter();
  const [comparison, setComparison] = useState<number | null>(null);
  const selected = versions.data?.find((version) => version.version === comparison);
  const conflict = restore.error instanceof ApiError && restore.error.status === 409;

  async function restoreVersion(version: SkillVersion) {
    if (!window.confirm(`Restore version ${version.version} as a new version for all workspaces?`)) return;
    restore.mutate({ skill, version: version.version }, { onSuccess: () => setComparison(null) });
  }

  return (
    <section>
      <h3>Version history {versions.data && <Badge color="var(--text-secondary)">{versions.data.length} versions</Badge>}</h3>
      <p className={styles.hint}>Body changes create a new version.</p>
      {hasDraft && <p className={styles.hint}>Save or discard your Config changes before restoring a version.</p>}
      {versions.isPending && <p role="status">Loading versions…</p>}
      {versions.isError && <p role="alert">Could not load versions. <Button onClick={() => void versions.refetch()}>Retry</Button></p>}
      {restore.isError && <p role="alert">{restore.error.message} {conflict && "Refresh the page to review the latest version."}</p>}
      <ol className={styles.history}>
        {versions.data?.map((version) => (
          <li key={version.version} className={styles.version}>
            <Badge color="var(--accent)">v{version.version}</Badge>
            <time dateTime={version.created_at}>
              {format.dateTime(new Date(version.created_at), { dateStyle: "medium", timeStyle: "short" })}
            </time>
            {version.version === skill.version ? <Badge color="var(--ok)">Current</Badge> : <>
              <Button size="sm" aria-expanded={comparison === version.version}
                onClick={() => setComparison(comparison === version.version ? null : version.version)}>Diff</Button>
              <Button size="sm" disabled={hasDraft || restore.isPending || conflict}
                onClick={() => void restoreVersion(version)}>Restore</Button>
            </>}
          </li>
        ))}
      </ol>
      {selected && <section className={styles.markdown} aria-label="Skill body diff">
        <h4>v{selected.version} → v{skill.version}</h4>
        <BodyDiff older={selected.body} current={skill.body} />
      </section>}
    </section>
  );
}

function BodyDiff({ older, current }: { older: string; current: string }) {
  const { start, removed, added } = changedLines(older, current);
  if (!removed.length && !added.length) return <p>The bodies are identical.</p>;
  return (
    <pre className={styles.diff}>
      <span>Changes from line {start + 1}{"\n"}</span>
      {removed.map((line, index) => <del key={index}>- {line}{"\n"}</del>)}
      {added.map((line, index) => <ins key={index}>+ {line}{"\n"}</ins>)}
    </pre>
  );
}
