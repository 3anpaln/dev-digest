"use client";

import { useId, useState, type FormEvent } from "react";
import { useFormatter, useTranslations } from "next-intl";
import type { ConventionCandidate, ConventionDecision, ConventionEvidence } from "@devdigest/shared";
import { Button, Icon } from "@devdigest/ui";
import { useEditConvention } from "../../../../../lib/hooks/conventions";
import styles from "./conventions.module.css";

const decisions = ["pending", "accepted", "rejected"] as const satisfies readonly ConventionDecision[];
const visibleExamples = 2;

function RuleText({ rule }: { rule: string }) {
  return rule.split(/(`[^`\r\n]+`)/g).map((part, index) =>
    part.startsWith("`") && part.endsWith("`") && part.length > 2
      ? <code key={index}>{part.slice(1, -1)}</code>
      : part);
}

function EvidenceExample({ example, linkLabel }: { example: ConventionEvidence; linkLabel: string }) {
  const { url, path, start_line, end_line, snippet } = example;
  return <div className={styles.example}>
    <div className={styles.exampleHeader}>
      <code>{path}:{start_line}{end_line > start_line ? "–" + end_line : ""}</code>
      <a href={url} target="_blank" rel="noreferrer">{linkLabel} <span aria-hidden="true">↗</span></a>
    </div>
    <pre><code>{snippet.split("\n").map((line, index) =>
      <span className={styles.codeLine} key={start_line + index}>
        <span className={styles.lineNumber} aria-hidden="true">{start_line + index}</span>
        <span>{line || "\u00a0"}</span>
      </span>,
    )}</code></pre>
  </div>;
}

export function ConventionCard({ finding, repoId, branch }: { finding: ConventionCandidate; repoId: string; branch: string }) {
  const t = useTranslations("conventions.card");
  const format = useFormatter();
  const detailsId = useId();
  const [expanded, setExpanded] = useState(false);
  const save = useEditConvention(repoId, branch, finding.id);
  const [draft, setDraft] = useState<{ rule: string; scope: string; revision: string }>();
  const confidence = Math.round(finding.confidence * 100);
  const files = new Set(finding.evidence.map(({ path }) => path)).size;
  const reviewed = finding.decision !== "pending";
  const showDetails = !reviewed || expanded;
  const metrics = <span className={styles.metrics}>
    <span className={styles.confidence}>
      {t("confidence")} <meter aria-label={t("confidence")} min={0} max={100} value={confidence} /> {confidence}%
    </span>
    <span>{t("evidenceCount", { examples: finding.evidence.length, files })}</span>
  </span>;

  function decide(decision: ConventionDecision) {
    save.mutate({ revision: finding.revision, decision });
  }

  function edit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || !draft.rule.trim() || !draft.scope.trim()) return;
    save.mutate(draft, { onSuccess: () => setDraft(undefined) });
  }

  return (
    <article className={styles.card} aria-label={finding.rule}>
      <div className={styles.cardHeader}>
        {reviewed ? <h3 className={styles.accordionHeading}>
          <button type="button" className={styles.accordionButton} aria-expanded={expanded} aria-controls={detailsId}
            onClick={() => setExpanded(!expanded)}>
            {expanded ? <Icon.ChevronDown size={16} aria-hidden="true" /> : <Icon.ChevronRight size={16} aria-hidden="true" />}
            <span>
              <span className={styles.rule}><RuleText rule={finding.rule} /></span>
              <span className={styles.scope}><strong>{t("scope")}</strong> {finding.scope}</span>
              {metrics}
            </span>
          </button>
        </h3> : <div>
          <h3 className={styles.rule}><RuleText rule={finding.rule} /></h3>
          <p className={styles.scope}><strong>{t("scope")}</strong> {finding.scope}</p>
        </div>}
        <select className={styles.decision} data-decision={finding.decision}
          aria-label={t("decision")} value={finding.decision} disabled={save.isPending || Boolean(draft)}
          onChange={(event) => {
            const value = event.currentTarget.value;
            const decision = decisions.find((option) => option === value);
            if (decision) decide(decision);
          }}>
          {decisions.map((decision) => <option key={decision} value={decision}>{t(decision)}</option>)}
        </select>
      </div>
      <div id={detailsId} className={styles.details} hidden={!showDetails}>
      {reviewed && <p className={styles.scope}>
        {finding.decided_at ? <time dateTime={finding.decided_at}>{t(finding.decision === "accepted" ? "acceptedOn" : "rejectedOn", {
          date: format.dateTime(new Date(finding.decided_at), { dateStyle: "medium", timeStyle: "short" }),
        })}</time> : t("decisionDateUnknown")}
      </p>}
      {finding.carried_forward && <p className={styles.scope}>{t("earlierEvidence")}</p>}
      {draft && (
        <form className={styles.form} onSubmit={edit}>
          <label>Convention<textarea required rows={3} maxLength={600} value={draft.rule}
            onChange={(event) => setDraft({ ...draft, rule: event.target.value })} /></label>
          <label>{t("scope")}<input required maxLength={240} value={draft.scope} placeholder="Entire repository"
            onChange={(event) => setDraft({ ...draft, scope: event.target.value })} /></label>
          <div className={styles.actions}>
            <Button type="button" disabled={save.isPending} onClick={() => { save.reset(); setDraft(undefined); }}>Cancel edit</Button>
            <Button kind="primary" type="submit" loading={save.isPending} disabled={!draft.rule.trim() || !draft.scope.trim()}>Save finding</Button>
          </div>
        </form>
      )}
      <section className={styles.evidence} aria-label={t("evidence")}>
        <h4>{t("evidence")}</h4>
        <div className={styles.examples}>
          {finding.evidence.slice(0, visibleExamples).map((example) =>
            <EvidenceExample key={example.url} example={example} linkLabel={t("viewEvidence")} />)}
        </div>
        {finding.evidence.length > visibleExamples && <details className={styles.moreEvidence}>
          <summary>{t("moreEvidence", { count: finding.evidence.length - visibleExamples })}</summary>
          <div className={styles.examples}>
            {finding.evidence.slice(visibleExamples).map((example) =>
              <EvidenceExample key={example.url} example={example} linkLabel={t("viewEvidence")} />)}
          </div>
        </details>}
      </section>
      <div className={styles.cardFooter}>
        {!reviewed && metrics}
        {!draft && <div className={styles.actions}>
          <Button kind="secondary" size="sm" icon="Edit" type="button" disabled={save.isPending} onClick={() => {
            save.reset();
            setDraft({ rule: finding.rule, scope: finding.scope, revision: finding.revision });
          }}>{t("edit")}</Button>
        </div>}
      </div>
      </div>
      {save.error && <p className={styles.error} role="alert">{save.error.message}</p>}
    </article>
  );
}
