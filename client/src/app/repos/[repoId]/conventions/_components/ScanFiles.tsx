"use client";

import { useTranslations } from "next-intl";
import type { ConventionScan } from "@devdigest/shared";
import styles from "./conventions.module.css";

export function ScanFiles({ attempt }: { attempt: ConventionScan }) {
  const t = useTranslations("conventions.page.history");
  const selected = attempt.selected_files;
  const skipped = attempt.skipped_files;
  const fileBase = attempt.commit_url.replace(/\/commit\/([^/]+)$/, "/blob/$1");

  function fileLink(path: string) {
    const href = fileBase + "/" + path.split("/").map(encodeURIComponent).join("/");
    return <a href={href} target="_blank" rel="noreferrer" aria-label={t("fileLink", { path })}>
      <code>{path}</code> <span aria-hidden="true">↗</span>
    </a>;
  }

  return <div className={styles.scanFileLists}>
    {selected?.length ? <details>
      <summary>{t(attempt.status === "done" ? "analyzedFiles" : "files", { count: selected.length })}</summary>
      <ul>{selected.map((path) => <li key={path}>{fileLink(path)}</li>)}</ul>
    </details> : <p>{selected == null
      ? [attempt.files_analyzed == null ? null : t("analyzed", { count: attempt.files_analyzed }), t("filesNotRecorded")].filter(Boolean).join(" · ")
      : t("noFiles")}</p>}
    {skipped?.length ? <details>
      <summary>{t("skippedFiles", { count: skipped.length })}</summary>
      <ul>{skipped.map(({ path, reason }) => <li key={path}>
        {fileLink(path)}<span>{t(`skipReason.${reason}`)}</span>
      </li>)}</ul>
    </details> : <p>{skipped == null
      ? [attempt.branch_files_skipped == null ? null : t("skipped", { count: attempt.branch_files_skipped }), t("skippedNotRecorded")].filter(Boolean).join(" · ")
      : t("noneSkipped")}</p>}
  </div>;
}
