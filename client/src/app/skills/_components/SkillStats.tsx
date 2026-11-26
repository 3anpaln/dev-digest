"use client";

import Link from "next/link";
import { useFormatter } from "next-intl";
import { Button } from "@devdigest/ui";
import { useSkillStats } from "../../../lib/hooks/skills";
import styles from "./skills.module.css";

export function SkillStats({ id, enabled }: { id: string; enabled: boolean }) {
  const query = useSkillStats(id);
  const format = useFormatter();
  if (query.isPending) return <p role="status">Loading stats…</p>;
  if (query.isError) return <p role="alert">Could not load stats. <Button onClick={() => void query.refetch()}>Retry</Button></p>;
  const { agents, runs, findings, accepted, dismissed, categories } = query.data;
  const triaged = accepted + dismissed;
  const metrics = [
    { label: "Assigned agents", value: format.number(agents.length) },
    { label: "Runs with skill (30d)", value: format.number(runs) },
    { label: "Findings on those runs (30d)", value: format.number(findings) },
    { label: "Finding accept rate (30d)", value: triaged ? format.number(accepted / triaged, { style: "percent" }) : "—" },
  ];
  return (
    <section>
      <h3>Stats</h3>
      <p className={styles.hint}>Findings and acceptance reflect runs that used this skill in the current workspace.</p>
      <dl className={styles.metrics}>
        {metrics.map(({ label, value }) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
      </dl>
      {triaged === 0 && <p className={styles.hint}>No findings have been accepted or dismissed in this period.</p>}
      <div className={styles.statPanels}>
        <section><h4>Assigned agents</h4>
          {agents.length === 0 ? <p>No assigned agents.</p> : <ul>
            {agents.map((agent) => <li key={agent.id}>
              <Link href={`/agents/${agent.id}?tab=skills`}>{agent.name}</Link>
              <small>{!enabled ? "Skill disabled" : agent.enabled ? "Active" : "Agent disabled"}</small>
            </li>)}
          </ul>}
        </section>
        <section><h4>Findings by category</h4>
          {categories.length === 0 ? <p>No recorded findings for this period.</p> : <ul>
            {categories.map(({ name, count }) => <li key={name}>
              <span>{name}</span><meter min={0} max={findings} value={count} aria-label={`${name} findings`} />
              <strong>{format.number(count)}</strong>
            </li>)}
          </ul>}
        </section>
      </div>
    </section>
  );
}
