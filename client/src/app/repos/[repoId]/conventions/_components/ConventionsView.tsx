"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import type { ConventionSkillDraft } from "@devdigest/shared";
import { Button, EmptyState, Icon } from "@devdigest/ui";
import { ApiError } from "../../../../../lib/api";
import { loadConventionDraft, useClearConventionDecisions, useConventions, useConventionScan, useSyncConventionBranch } from "../../../../../lib/hooks/conventions";
import { useRepoNotFound } from "../../../../../lib/repo-context";
import { ConventionCard } from "./ConventionCard";
import { CreateConventionSkillDialog } from "./CreateConventionSkillDialog";
import { ScanHistory } from "./ScanHistory";
import { ScanFiles } from "./ScanFiles";
import styles from "./conventions.module.css";

export function ConventionsView({ repoId }: { repoId: string }) {
  const missing = useRepoNotFound(repoId);
  if (repoId === "_" || missing) {
    return <div className={styles.page}>
      <h1>Conventions</h1>
      <p>Select a repository in the sidebar or <Link href="/onboarding">add a repository</Link> to scan.</p>
    </div>;
  }
  return <RepositoryConventions repoId={repoId} />;
}

function RepositoryConventions({ repoId }: { repoId: string }) {
  const t = useTranslations("conventions.page");
  const format = useFormatter();
  const [branchInput, setBranchInput] = useState("main");
  const branch = branchInput.trim();
  const query = useConventions(repoId, branch);
  const scan = useConventionScan(repoId);
  const sync = useSyncConventionBranch(repoId);
  const clear = useClearConventionDecisions(repoId, branch);
  const clearDialog = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState<ConventionSkillDraft>();
  const draftOpener = useRef<HTMLButtonElement>(null);
  const [opening, setOpening] = useState(false);
  const [draftError, setDraftError] = useState("");
  const [limitInput, setLimitInput] = useState<string>();
  const [tokenInput, setTokenInput] = useState<string>();
  const [folderInput, setFolderInput] = useState<string>();
  const [expandedGroups, setExpandedGroups] = useState({ pending: true, accepted: false, rejected: false });
  const data = query.data;
  const limit = limitInput ?? String(data?.latest?.file_limit ?? 20);
  const tokens = tokenInput ?? String(data?.latest?.max_response_tokens ?? 5000);
  const previousFolder = data?.latest?.focus_directory;
  const directory = folderInput ?? (previousFolder && previousFolder !== "." ? previousFolder : "");
  const fileLimit = Number(limit);
  const validLimit = /^\d+$/.test(limit) && Number.isSafeInteger(fileLimit);
  const maxResponseTokens = Number(tokens);
  const validTokens = /^\d+$/.test(tokens) && Number.isSafeInteger(maxResponseTokens) && maxResponseTokens > 0;
  const current = data?.successful;
  const active = data?.active_branch === branch;
  const anotherBranchActive = Boolean(data?.active_branch && !active);
  const canStart = Boolean(branch && data?.readiness === "ready" && validLimit && validTokens && !data.active_branch && !sync.isPending);
  const branchUnavailable = scan.error instanceof ApiError && scan.error.code === "branch_unavailable";
  const accepted = data?.findings.filter(({ decision }) => decision === "accepted").length ?? 0;
  const hasDecisions = data?.findings.some(({ decision }) => decision !== "pending");

  async function openDraft(opener: HTMLButtonElement) {
    draftOpener.current = opener;
    setOpening(true);
    setDraftError("");
    try {
      setDraft(await loadConventionDraft(repoId, branch));
    } catch (error) {
      setDraftError(error instanceof Error ? error.message : "Could not open the skill draft.");
    } finally {
      setOpening(false);
    }
  }

  function startScan() {
    sync.reset();
    scan.mutate({ branch, fileLimit, directory: directory.trim(), maxResponseTokens });
  }

  return <div className={styles.page}>
    <div className={styles.header}>
      <div>
        <h1>{data ? <>{t("headingPrefix")}<span>{data.repository}</span></> : t("crumbConventions")}</h1>
        {data?.latest ? <p role="status" className={styles.scope}>{t("acceptedCount", { accepted, total: data.findings.length })}</p>
          : <p className={styles.subtitle}>{t("subtitle")}</p>}
      </div>
      {data?.latest && <div className={styles.actions}>
        <Button kind="secondary" type="button" disabled={!hasDecisions || clear.isPending} onClick={() => {
          clear.reset();
          clearDialog.current?.showModal();
        }}>{t("clearDecisions.action")}</Button>
        <Button icon="RefreshCw" type="button" loading={scan.isPending || active} disabled={!canStart}
          onClick={startScan}>{active ? t("scanning") : t("rescan")}</Button>
        <Button kind="primary" icon="Sparkles" type="button" loading={opening} disabled={accepted === 0}
          onClick={(event) => void openDraft(event.currentTarget)}>Create skill</Button>
      </div>}
    </div>
    {clear.isSuccess && <p role="status">{t("clearDecisions.success")}</p>}
    <dialog ref={clearDialog} className={styles.dialog} aria-labelledby="clear-decisions-title"
      aria-describedby="clear-decisions-warning" onCancel={(event) => {
        if (clear.isPending) event.preventDefault();
      }}>
      <h2 id="clear-decisions-title">{t("clearDecisions.action")}</h2>
      <p id="clear-decisions-warning">{t("clearDecisions.warning")}</p>
      {clear.error && <p className={styles.error} role="alert">{clear.error.message}</p>}
      <div className={styles.confirmActions}>
        <Button type="button" autoFocus disabled={clear.isPending}
          onClick={() => clearDialog.current?.close()}>{t("clearDecisions.cancel")}</Button>
        <Button type="button" kind="danger" loading={clear.isPending} onClick={() => clear.mutate(undefined, {
          onSuccess: () => {
            setExpandedGroups((groups) => ({ ...groups, pending: true }));
            clearDialog.current?.close();
          },
        })}>{t("clearDecisions.confirm")}</Button>
      </div>
    </dialog>
    <details className={styles.scanOptions}>
      <summary>{t("scanOptions")}</summary>
      <div className={styles.focusPicker}>
      <div>
        <label htmlFor="conventions-branch">{t("focus.branch")}</label>
        <input id="conventions-branch" type="text" maxLength={255} value={branchInput}
          aria-describedby="conventions-branch-help" disabled={scan.isPending || sync.isPending || opening}
          onChange={(event) => {
            setBranchInput(event.target.value);
            setLimitInput(undefined);
            setTokenInput(undefined);
            setFolderInput(undefined);
            scan.reset();
            sync.reset();
            clear.reset();
          }} />
        <p id="conventions-branch-help">{t("focus.branchHelp")}</p>
      </div>
      <div>
        <label htmlFor="conventions-folder">{t("focus.directory")}</label>
        <input id="conventions-folder" type="text" maxLength={500} value={directory}
          aria-describedby="conventions-folder-help" disabled={active || scan.isPending}
          onChange={(event) => setFolderInput(event.target.value)} />
        <p id="conventions-folder-help">{t("focus.directoryHelp")}</p>
      </div>
      <div>
        <label htmlFor="conventions-focus">{t("focus.label")}</label>
        <input id="conventions-focus" type="number" min={0} max={Number.MAX_SAFE_INTEGER} step={1} value={limit}
          aria-describedby="conventions-focus-help" disabled={active || scan.isPending}
          aria-invalid={!validLimit} onChange={(event) => setLimitInput(event.target.value)} />
        <p id="conventions-focus-help">{t("focus.help")}</p>
      </div>
      <div>
        <label htmlFor="conventions-tokens">{t("focus.tokens")}</label>
        <input id="conventions-tokens" type="number" min={1} max={Number.MAX_SAFE_INTEGER} step={1} value={tokens}
          aria-describedby="conventions-tokens-help" disabled={active || scan.isPending}
          aria-invalid={!validTokens} onChange={(event) => setTokenInput(event.target.value)} />
        <p id="conventions-tokens-help">{t("focus.tokensHelp")}</p>
      </div>
      </div>
    </details>
    {branch && query.isPending && <p role="status">Loading conventions…</p>}
    {query.isError && <div role="alert">{t("loadError")} <Button type="button" onClick={() => void query.refetch()}>Retry</Button></div>}
    {data?.readiness === "clone" && <p role="status">{t("clonePending")}</p>}
    {scan.error && <p role="alert" className={styles.error}>{scan.error.message}</p>}
    {branchUnavailable && <Button type="button" icon="RefreshCw" loading={sync.isPending}
      onClick={() => sync.mutate(branch, { onSuccess: () => scan.reset() })}>{t("syncBranch")}</Button>}
    {sync.error && <p role="alert" className={styles.error}>{sync.error.message}</p>}
    {sync.isSuccess && <p role="status">{t("branchSynced", { branch: sync.data.branch })}</p>}
    {anotherBranchActive && <p role="status">{t("anotherBranchActive", { branch: data?.active_branch ?? "" })}</p>}
    {draftError && <p role="alert" className={styles.error}>{draftError}</p>}
    {data?.latest?.status === "failed" && <p role="alert" className={styles.error}>
      <strong>{t("extractionFailed")}</strong> {data.latest.error}
    </p>}
    {data?.latest && data.latest.id !== current?.id && <section className={styles.scanInfo} aria-labelledby="latest-attempt-files">
      <div className={styles.scanSummaryHeader}><h2 id="latest-attempt-files">{t("history.latestFiles")}</h2></div>
      <ScanFiles attempt={data.latest} />
    </section>}
    {current && <section className={styles.scanInfo} aria-labelledby="last-successful-scan">
      <div className={styles.scanSummaryHeader}>
        <div>
          <h2 id="last-successful-scan">{t("summary.title")}</h2>
          <p><a href={current.branch_url} target="_blank" rel="noreferrer"
              aria-label={t("history.branchLink", { branch: current.branch })}><code>{current.branch}</code></a>
            {" · "}<code title={current.commit}>{current.commit.slice(0, 8)}</code>
          </p>
        </div>
        {current.finished_at && <time dateTime={current.finished_at}>
          {format.dateTime(new Date(current.finished_at), { dateStyle: "medium", timeStyle: "short" })}
        </time>}
      </div>
      <dl className={styles.scanFacts}>
        {current.files_analyzed != null && <div>
          <dt>{t(current.branch_files_skipped == null ? "summary.sampled" : "summary.analyzed")}</dt>
          <dd>{format.number(current.files_analyzed)}</dd>
        </div>}
        {current.branch_files_skipped != null && <div><dt>{t("summary.skipped")}</dt><dd>{format.number(current.branch_files_skipped)}</dd></div>}
        <div><dt>{t("summary.scope")}</dt>
          <dd>{current.focus_directory && current.focus_directory !== "." ? <code>{current.focus_directory}</code> : t("focus.wholeProject")}</dd>
        </div>
        {current.file_limit != null && <div><dt>{t("summary.limit")}</dt>
          <dd>{current.file_limit === 0 ? t("summary.unlimited") : format.number(current.file_limit)}
            {current.file_budget_reached && <span className={styles.limitBadge}>{t("summary.limitReached")}</span>}</dd>
        </div>}
      </dl>
      {data?.latest?.id === current.id && <ScanFiles attempt={current} />}
      {current.changes && <p role="status">{t("scanChanges", {
        kept: current.changes.decisions_kept, added: current.changes.new_findings,
      })}{Boolean(current.changes.reviewed_not_rediscovered) && <>{" · "}{t("previousEvidence", { count: current.changes.reviewed_not_rediscovered ?? 0 })}</>}</p>}
    </section>}
    <ScanHistory attempts={data?.attempts ?? []} />
    {data && !data.latest && data.readiness === "ready" && <EmptyState icon="ListChecks"
      title={t("empty.title")} body={t("empty.body")}
      cta={canStart || scan.isPending ? t("runExtraction") : undefined} onCta={startScan} ctaLoading={scan.isPending} />}
    {current && data?.findings.length === 0 && <p className={styles.empty}>{t("noFindings")}</p>}
    {(["pending", "accepted", "rejected"] as const).map((decision) => {
      const findings = data?.findings.filter((finding) => finding.decision === decision) ?? [];
      if (!findings.length) return null;
      const expanded = expandedGroups[decision];
      const listId = "conventions-list-" + decision;
      return <section key={decision} className={styles.group} data-status={decision} aria-labelledby={"conventions-" + decision}>
        <h2 id={"conventions-" + decision} className={styles.groupHeading}>
          <button type="button" className={styles.groupToggle} aria-expanded={expanded} aria-controls={listId}
            onClick={() => setExpandedGroups((groups) => ({ ...groups, [decision]: !groups[decision] }))}>
            {expanded ? <Icon.ChevronDown size={18} aria-hidden="true" /> : <Icon.ChevronRight size={18} aria-hidden="true" />}
            {t.rich(`group.${decision}`, {
              count: findings.length,
              badge: (value) => <span className={styles.groupCount}>{value}</span>,
            })}
          </button>
        </h2>
        <div id={listId} hidden={!expanded}>
          <div className={styles.cards}>{findings.map((finding) => <ConventionCard key={finding.id} finding={finding} repoId={repoId} branch={branch} />)}</div>
        </div>
      </section>;
    })}
    {draft && data && <CreateConventionSkillDialog repoId={repoId} branch={branch} repository={data.repository} initial={draft}
      opener={draftOpener.current} onClose={() => setDraft(undefined)} />}
  </div>;
}
