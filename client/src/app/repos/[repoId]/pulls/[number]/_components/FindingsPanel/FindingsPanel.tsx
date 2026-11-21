"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, EmptyState, SEV, Toggle } from "@devdigest/ui";
import type { FindingRecord, Severity } from "@devdigest/shared";
import { FindingCard } from "../FindingCard";
import { useFindingAction } from "../../../../../../../lib/hooks/reviews";
import { FILTER_SEVERITIES, KEY_TO_ACTION } from "./constants";
import { visibleFindings } from "./helpers";
import { s } from "./styles";

export function FindingsPanel({
  findings,
  prId,
  repoFullName,
  headSha,
}: {
  findings: FindingRecord[];
  prId: string;
  repoFullName?: string | null;
  headSha?: string | null;
}) {
  const t = useTranslations("prReview");
  const action = useFindingAction();
  const [hideLow, setHideLow] = React.useState(false);
  const [severity, setSeverity] = React.useState<Severity | null>(null);
  const [focusIdx, setFocusIdx] = React.useState(0);

  const shown = React.useMemo(
    () => visibleFindings(findings, hideLow, severity),
    [findings, hideLow, severity],
  );
  const counts = new Map<Severity, number>();
  for (const finding of findings) {
    counts.set(finding.severity, (counts.get(finding.severity) ?? 0) + 1);
  }

  function toggleSeverity(level: Severity) {
    setSeverity((selected) => selected === level ? null : level);
    setFocusIdx(0);
  }

  // j/k navigation + a/d shortcuts on the focused finding (keyboard).
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || shown.length === 0) return;
      if (e.key === "j") setFocusIdx((i) => Math.min(i + 1, shown.length - 1));
      else if (e.key === "k") setFocusIdx((i) => Math.max(i - 1, 0));
      else if (KEY_TO_ACTION[e.key] && shown[focusIdx]) {
        action.mutate({ findingId: shown[focusIdx]!.id, action: KEY_TO_ACTION[e.key]!, prId });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [shown, focusIdx, action, prId]);

  return (
    <div>
      <div style={s.toolbar}>
        {FILTER_SEVERITIES.map((level) => {
          const count = counts.get(level);
          if (!count) return null;
          const active = level === severity;
          const { c: color } = SEV[level];
          return (
            <Button
              key={level}
              type="button"
              kind="ghost"
              size="sm"
              aria-pressed={active}
              onClick={() => toggleSeverity(level)}
              style={{
                ...s.severityButton,
                color: active ? "#fff" : color,
                borderColor: color,
                ...(active && s.activeSeverityButton(color)),
              }}
            >
              {t("panel.severityCount", { count, severity: level })}
            </Button>
          );
        })}
        <label style={s.toggleGroup}>
          {t("panel.hideLowConfidence")}
          <Toggle
            on={hideLow}
            onChange={(next) => {
              setHideLow(next);
              setFocusIdx(0);
            }}
            size={16}
          />
        </label>
      </div>

      <div style={s.list}>
        {findings.length === 0 ? (
          <EmptyState title={t("panel.noFindingsTitle")} />
        ) : shown.length === 0 ? (
          <EmptyState icon="Filter" title={t("panel.noMatchTitle")} body={t("panel.noMatchBody")} />
        ) : (
          shown.map((f, i) => (
            <FindingCard
              key={f.id}
              f={f}
              focused={i === focusIdx}
              defaultExpanded={i === 0}
              pending={action.isPending}
              repoFullName={repoFullName}
              headSha={headSha}
              onAction={(act) => action.mutate({ findingId: f.id, action: act, prId })}
            />
          ))
        )}
      </div>
    </div>
  );
}
