"use client";

import type { CSSProperties } from "react";
import { useTranslations } from "next-intl";
import { CategoryTag, ConfidenceNum, Icon, SEV } from "@devdigest/ui";
import type { FindingPreview } from "@devdigest/shared";
import { usePrFindings } from "@/lib/hooks/core";

const itemHeader: CSSProperties = { display: "flex", alignItems: "center", flexWrap: "wrap", gap: 5 };
const excerpt: CSSProperties = {
  fontSize: 11,
  color: "var(--text-secondary)",
  overflow: "hidden",
  overflowWrap: "anywhere",
  display: "-webkit-box",
  WebkitBoxOrient: "vertical",
  WebkitLineClamp: 2,
};

export function FindingPreviewItems({ findings }: { findings: FindingPreview[] }) {
  return findings.map((finding) => {
    const { c: color, icon } = SEV[finding.severity];
    const SeverityIcon = Icon[icon];
    const line = finding.end_line > finding.start_line
      ? `${finding.start_line}–${finding.end_line}`
      : finding.start_line;
    return (
      <div key={finding.id} style={{ padding: "6px 0", borderTop: "1px solid var(--border)" }}>
        <div style={itemHeader}>
          <SeverityIcon size={12} style={{ color }} aria-hidden="true" />
          <span className="sr-only">{SEV[finding.severity].label}</span>
          <strong style={{ fontSize: 12, overflowWrap: "anywhere" }}>{finding.title}</strong>
          <CategoryTag category={finding.category} />
        </div>
        <div style={itemHeader}>
          <span className="mono" style={{ color: "var(--accent-text)", fontSize: 10, overflowWrap: "anywhere" }}>
            {finding.file}:{line}
          </span>
          <ConfidenceNum value={finding.confidence} />
        </div>
        <div style={excerpt}>{finding.rationale.slice(0, 280)}</div>
      </div>
    );
  });
}

export function PrFindingPreviewItems({ prId, preview }: { prId: string; preview: FindingPreview[] }) {
  const t = useTranslations("prReview.findingsPreview");
  const { data, isPending, isError, refetch } = usePrFindings(prId);
  return (
    <>
      <FindingPreviewItems findings={data ?? preview} />
      {isPending && <div role="status">{t("loadingMore")}</div>}
      {data?.length === 0 && <div role="status">{t("empty")}</div>}
      {isError && (
        <div role="status">
          {t("loadError")} <button type="button" onClick={() => refetch()}>{t("retry")}</button>
        </div>
      )}
    </>
  );
}
