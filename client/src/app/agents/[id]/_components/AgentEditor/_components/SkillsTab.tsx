"use client";

import Link from "next/link";
import { useRef, useState, type PointerEvent } from "react";
import { ArrowDown, ArrowUp, GripVertical } from "lucide-react";
import { Badge, Button } from "@devdigest/ui";
import { useAgentSkills, useSaveAgentSkills, useSkills } from "../../../../../../lib/hooks/skills";
import styles from "./SkillsTab.module.css";

export function SkillsTab({ agentId }: { agentId: string }) {
  const library = useSkills();
  const assignments = useAgentSkills(agentId);
  const save = useSaveAgentSkills(agentId);
  const [draft, setDraft] = useState<string[] | null>(null);
  const [filter, setFilter] = useState("");
  const drag = useRef<{ id: string; pointerId: number } | null>(null);
  const [dropMarker, setDropMarker] = useState<{ position: number; side: "before" | "after" } | null>(null);
  const [announcement, setAnnouncement] = useState("");

  if (library.isPending || assignments.isPending) return <p role="status">Loading skills…</p>;
  if (library.isError || assignments.isError) {
    return <div role="alert">Could not load skills. <Button onClick={() => {
      void library.refetch();
      void assignments.refetch();
    }}>Retry</Button></div>;
  }

  const saved = assignments.data.map((link) => link.skill_id);
  const selected = draft ?? saved;
  const byId = new Map(library.data.map((skill) => [skill.id, skill]));
  const query = filter.trim().toLowerCase();
  const canReorder = !query && !save.isPending && selected.length > 1;
  const list = [...selected, ...library.data.filter((skill) => !selected.includes(skill.id)).map((skill) => skill.id)]
    .flatMap((id) => {
      const skill = byId.get(id);
      return skill && `${skill.name} ${skill.type}`.toLowerCase().includes(query) ? [skill] : [];
    });
  const active = selected.filter((id) => byId.get(id)?.enabled).length;
  const dirty = selected.length !== saved.length || selected.some((id, index) => id !== saved[index]);

  function move(id: string, position: number) {
    const next = selected.filter((skillId) => skillId !== id);
    next.splice(position, 0, id);
    setDraft(next);
    setAnnouncement(`${byId.get(id)?.name} moved to position ${position + 1} of ${next.length}.`);
  }

  function moveWithButton(button: HTMLButtonElement, id: string, position: number) {
    move(id, position);
    requestAnimationFrame(() => { if (button.isConnected) button.focus(); });
  }

  function resetDrag() {
    drag.current = null;
    setDropMarker(null);
  }

  function targetPosition(event: PointerEvent<HTMLSpanElement>): number | null {
    const listElement = event.currentTarget.closest("ul");
    if (!listElement) return null;
    const bounds = listElement.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right
      || event.clientY < bounds.top || event.clientY > bounds.bottom) return null;
    const rows = Array.from(listElement.querySelectorAll<HTMLElement>("li[data-selected=true]"));
    let closest = null;
    let minDistance = Infinity;
    for (const row of rows) {
      const rect = row.getBoundingClientRect();
      const distance = Math.abs(event.clientY - (rect.top + rect.height / 2));
      if (distance < minDistance) {
        minDistance = distance;
        closest = Number(row.dataset.position);
      }
    }
    return closest;
  }

  return (
    <section className={styles.panel} aria-labelledby="agent-skills-heading">
      <div className={styles.toolbar}>
        <h2 id="agent-skills-heading">Skills</h2>
        <Badge color="var(--accent)">{active} of {library.data.length} enabled</Badge>
        <input type="search" aria-label="Filter skills" placeholder="Filter skills…" value={filter}
          onChange={(event) => { setFilter(event.target.value); resetDrag(); }} />
      </div>
      <p className={styles.hint}>{query
        ? "Clear the filter to reorder skills."
        : "Drag to reorder. Earlier skills appear earlier in the review prompt."}</p>
      {library.data.length === 0 && <p>No skills yet. <Link href="/skills">Open the Skills library</Link></p>}
      {query && list.length === 0 && library.data.length > 0 && <p>No matching skills.</p>}
      <ul className={styles.list} aria-label="Agent skills">
        {list.map((skill) => {
          const index = selected.indexOf(skill.id);
          const checked = index !== -1;
          const canDrag = checked && canReorder;
          const dropMark = dropMarker?.position === index ? dropMarker.side : undefined;
          return (
            <li key={skill.id} className={styles.row} data-selected={checked} data-position={index} data-insertion={dropMark}>
              {checked && <span className={styles.handle} data-drag-handle={canDrag ? skill.id : undefined} aria-hidden="true"
                onPointerDown={(event) => {
                  if (!canDrag || event.button !== 0 || !event.isPrimary) return;
                  event.preventDefault();
                  event.currentTarget.setPointerCapture(event.pointerId);
                  drag.current = { id: skill.id, pointerId: event.pointerId };
                }}
                onPointerMove={(event) => {
                  if (drag.current?.pointerId !== event.pointerId) return;
                  const position = targetPosition(event);
                  setDropMarker(position === null || position === index
                    ? null : { position, side: position < index ? "before" : "after" });
                }}
                onPointerUp={(event) => {
                  if (drag.current?.pointerId !== event.pointerId) return;
                  const target = targetPosition(event);
                  if (target !== null && target !== index) move(skill.id, target);
                  resetDrag();
                }}
                onPointerCancel={resetDrag}
                onLostPointerCapture={resetDrag}><GripVertical size={16} /></span>}
              <label className={styles.label}>
                <input type="checkbox" checked={checked} disabled={save.isPending || (!skill.enabled && !checked)}
                  onChange={() => setDraft(checked ? selected.filter((id) => id !== skill.id) : [...selected, skill.id])} />
                <span>{skill.name}</span>
              </label>
              {!skill.enabled && <small>Disabled</small>}
              <Badge color="var(--text-secondary)">{skill.type}</Badge>
              {checked && <div className={styles.moves}>
                <button type="button" aria-label={`Move ${skill.name} up`} aria-disabled={!canReorder || index === 0}
                  onClick={(event) => { if (canReorder && index > 0) moveWithButton(event.currentTarget, skill.id, index - 1); }}><ArrowUp size={15} /></button>
                <button type="button" aria-label={`Move ${skill.name} down`} aria-disabled={!canReorder || index === selected.length - 1}
                  onClick={(event) => { if (canReorder && index < selected.length - 1) moveWithButton(event.currentTarget, skill.id, index + 1); }}><ArrowDown size={15} /></button>
              </div>}
            </li>
          );
        })}
      </ul>
      <span role="status" className={styles.announcement}>{announcement}</span>
      {save.isError && <p role="alert">{save.error.message}</p>}
      <Button kind="primary" disabled={!dirty || save.isPending}
        onClick={() => save.mutate(selected, { onSuccess: () => { setDraft(null); setAnnouncement("Skill order saved."); } })}>
        {save.isPending ? "Saving…" : "Save changes"}
      </Button>
    </section>
  );
}
