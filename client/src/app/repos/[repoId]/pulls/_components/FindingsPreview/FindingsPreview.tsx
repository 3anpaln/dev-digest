"use client";

import React, { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useFormatter, useTranslations } from "next-intl";
import { CategoryTag, ConfidenceNum, Icon, SEV } from "@devdigest/ui";
import type { FindingPreview, FindingSummary } from "@devdigest/shared";

const levels = [
  { severity: "CRITICAL", countKey: "critical" },
  { severity: "WARNING", countKey: "warning" },
  { severity: "SUGGESTION", countKey: "suggestion" },
] as const;

export function summarizeFindings(findings: FindingPreview[]): FindingSummary {
  const counts = { critical: 0, warning: 0, suggestion: 0 };
  const preview: FindingPreview[] = [];
  for (const { severity, countKey } of levels) {
    for (const finding of findings) {
      if (finding.severity !== severity) continue;
      counts[countKey] += 1;
      if (preview.length < 3) preview.push(finding);
    }
  }
  return { counts, preview };
}

const card: CSSProperties = {
  padding: "8px 10px",
  border: "1px solid var(--border-strong)",
  borderRadius: 8,
  background: "var(--bg-elevated)",
  boxShadow: "0 6px 20px #0005",
  color: "var(--text-primary)",
  overflowY: "auto",
};

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

export function FindingsPreview({ summary, scope }: {
  summary: FindingSummary;
  scope: "pr" | "run";
}) {
  const t = useTranslations("prReview.findingsPreview");
  const format = useFormatter();
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<CSSProperties | null>(null);
  const total = summary.counts.critical + summary.counts.warning + summary.counts.suggestion;
  const visibleLevels = levels.filter(({ countKey }) => summary.counts[countKey] > 0);
  const heading = t(scope === "run" ? "runTotal" : "prTotal", { count: total });

  function openPreview() {
    if (!trigger.current) return;
    const { left, top, bottom } = trigger.current.getBoundingClientRect();
    const width = Math.min(308, window.innerWidth - 16);
    const spaceBelow = window.innerHeight - bottom;
    const above = spaceBelow < 260 && top > spaceBelow;
    setPosition({
      left: Math.max(8, Math.min(left, window.innerWidth - width - 8)),
      width,
      top: above ? undefined : bottom,
      bottom: above ? window.innerHeight - top : undefined,
      maxHeight: Math.max(0, (above ? top : spaceBelow) - 8),
    });
  }

  const isOpen = position !== null;
  useEffect(() => {
    if (!isOpen) return;
    const close = () => setPosition(null);
    const isInsidePanel = (target: EventTarget | null) =>
      target instanceof Node && panel.current?.contains(target);
    const onPointerDown = (event: PointerEvent) => {
      if (event.target !== trigger.current && !trigger.current?.contains(event.target as Node)
        && !isInsidePanel(event.target)) close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    const onScroll = (event: Event) => {
      if (!isInsidePanel(event.target)) close();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [isOpen]);

  if (total === 0) return null;
  const breakdown = visibleLevels.map(({ countKey }) => t(countKey, { count: summary.counts[countKey] }));

  return (
    <span
      onClick={(event) => event.stopPropagation()}
      onMouseEnter={openPreview}
      onMouseLeave={() => setPosition(null)}
      style={{ display: "inline-flex" }}
    >
      <button
        ref={trigger}
        type="button"
        aria-label={t("trigger", { breakdown: format.list(breakdown) })}
        aria-expanded={isOpen}
        aria-controls={isOpen ? id : undefined}
        onFocus={openPreview}
        onBlur={() => setPosition(null)}
        onClick={openPreview}
        style={{
          display: "inline-flex",
          gap: 6,
          border: 0,
          background: "none",
          padding: "2px 0",
          cursor: "pointer",
        }}
      >
        {visibleLevels.map(({ severity, countKey }) => {
          const { c: color, icon } = SEV[severity];
          const SeverityIcon = Icon[icon];
          return (
            <span
              key={severity}
              aria-hidden="true"
              className="mono"
              style={{
                display: "inline-flex", alignItems: "center", gap: 2, fontSize: 11, color,
                borderBottom: "1px dotted currentColor",
              }}
            >
              <SeverityIcon size={11} />
              {format.number(summary.counts[countKey])}
            </span>
          );
        })}
      </button>
      {position && createPortal(
        <div
          ref={panel}
          id={id}
          role="region"
          aria-label={heading}
          style={{ ...card, ...position, position: "fixed", zIndex: 80, cursor: "default" }}
        >
          <div style={{ marginBottom: 6, fontSize: 10, textTransform: "uppercase", color: "var(--text-muted)" }}>
            {heading}
          </div>
          {summary.preview.map((finding) => {
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
          })}
        </div>,
        document.body,
      )}
    </span>
  );
}
