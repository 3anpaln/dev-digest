"use client";

import { useFormatter, useTranslations } from "next-intl";
import type { ConventionScan } from "@devdigest/shared";
import { ScanFiles } from "./ScanFiles";
import styles from "./conventions.module.css";

export function ScanHistory({ attempts }: { attempts: ConventionScan[] }) {
  const t = useTranslations("conventions.page.history");
  const focus = useTranslations("conventions.page.focus");
  const format = useFormatter();
  if (!attempts.length) return null;

  return <details className={styles.history}>
    <summary>{t("title", { count: attempts.length })}</summary>
    <ol>
      {attempts.map((attempt) => <li key={attempt.id} className={styles.historyEntry}>
        <header className={styles.historyEntryHeader}>
          <div>
            <span className={styles.historyStatus} data-scan-status={attempt.status}>{t(attempt.status)}</span>
            <span>{attempt.findings_count == null ? t("noResult") : t("findings", { count: attempt.findings_count })}</span>
          </div>
          <time dateTime={attempt.queued_at}>
            {format.dateTime(new Date(attempt.queued_at), { dateStyle: "medium", timeStyle: "short" })}
          </time>
        </header>
        <dl className={styles.historyFacts}>
          <div><dt>{t("revision")}</dt><dd>
            <a className={styles.historyBranch} href={attempt.branch_url} target="_blank" rel="noreferrer"
              aria-label={t("branchLink", { branch: attempt.branch })}><code>{attempt.branch}</code> <span aria-hidden="true">↗</span></a>
            {" · "}<code title={attempt.commit}>{attempt.commit.slice(0, 8)}</code>
          </dd></div>
          <div><dt>{t("scope")}</dt><dd>
            {attempt.focus_directory && attempt.focus_directory !== "." ? <code>{attempt.focus_directory}</code> : focus("wholeProject")}
            {attempt.file_limit != null && <>{" · "}{attempt.file_limit === 0
              ? focus("all") : focus("budget", { count: attempt.file_limit })}</>}
            {attempt.file_budget_reached && <>{" · "}{focus("limitReached")}</>}
          </dd></div>
          <div><dt>{t("modelLabel")}</dt><dd>
            {attempt.model_choice ? t("model", { provider: attempt.model_choice.provider, name: attempt.model_choice.model }) : t("unknownModel")}
          </dd></div>
          <div><dt>{t("tokenLabel")}</dt><dd>
            {attempt.max_response_tokens == null ? t("tokenLimitNotRecorded") : format.number(attempt.max_response_tokens)}
          </dd></div>
        </dl>
        <ScanFiles attempt={attempt} />
        {attempt.error && <p className={styles.historyError}>{attempt.error}</p>}
      </li>)}
    </ol>
  </details>;
}
