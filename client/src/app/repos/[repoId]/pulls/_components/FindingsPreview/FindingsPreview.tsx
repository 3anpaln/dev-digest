"use client";

import React, { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useFormatter, useTranslations } from "next-intl";
import { Icon, SEV } from "@devdigest/ui";
import type { FindingPreview, FindingSummary } from "@devdigest/shared";
import { FindingPreviewItems, PrFindingPreviewItems } from "./FindingPreviewItems";

const MAX_PREVIEW_HEIGHT = 360;

const levels = [
  { severity: "CRITICAL", countKey: "critical" },
  { severity: "WARNING", countKey: "warning" },
  { severity: "SUGGESTION", countKey: "suggestion" },
] as const;

export function summarizeFindings(findings: FindingPreview[]): FindingSummary {
  const buckets = new Map(levels.map(({ severity, countKey }) => [
    severity, { countKey, count: 0, candidates: [] as FindingPreview[] },
  ]));
  for (const finding of findings) {
    const bucket = buckets.get(finding.severity);
    if (!bucket) continue;
    bucket.count += 1;
    if (bucket.candidates.length < 3) bucket.candidates.push(finding);
  }

  const counts = { critical: 0, warning: 0, suggestion: 0 };
  const preview: FindingPreview[] = [];
  for (const { countKey, count, candidates } of buckets.values()) {
    counts[countKey] = count;
    preview.push(...candidates.slice(0, 3 - preview.length));
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
  boxSizing: "border-box",
  overflowY: "auto",
  overscrollBehaviorY: "contain",
};

export function FindingsPreview({ summary, scope, prId }: {
  summary: FindingSummary;
  scope: "pr" | "run";
  prId?: string;
}) {
  const t = useTranslations("prReview.findingsPreview");
  const format = useFormatter();
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [position, setPosition] = useState<CSSProperties | null>(null);
  const total = summary.counts.critical + summary.counts.warning + summary.counts.suggestion;
  const visibleLevels = levels.filter(({ countKey }) => summary.counts[countKey] > 0);
  const heading = t(scope === "run" ? "runTotal" : "prTotal", { count: total });

  function openPreview() {
    clearTimeout(closeTimer.current);
    if (!trigger.current) return;
    const { left, top, bottom } = trigger.current.getBoundingClientRect();
    const width = Math.min(308, window.innerWidth - 16);
    const spaceBelow = window.innerHeight - bottom;
    const above = spaceBelow < MAX_PREVIEW_HEIGHT && top > spaceBelow;
    setPosition({
      left: Math.max(8, Math.min(left, window.innerWidth - width - 8)),
      width,
      top: above ? undefined : bottom,
      bottom: above ? window.innerHeight - top : undefined,
      maxHeight: Math.min(MAX_PREVIEW_HEIGHT, Math.max(0, (above ? top : spaceBelow) - 8)),
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
      if (event.key !== "Escape") return;
      if (isInsidePanel(document.activeElement)) trigger.current?.focus();
      close();
    };
    const onScroll = (event: Event) => {
      if (!isInsidePanel(event.target)) close();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      clearTimeout(closeTimer.current);
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
      onMouseLeave={() => {
        if (!isOpen) return;
        clearTimeout(closeTimer.current);
        closeTimer.current = setTimeout(() => setPosition(null), 150);
      }}
      onBlur={(event) => {
        if (event.relatedTarget !== trigger.current && !panel.current?.contains(event.relatedTarget)) {
          setPosition(null);
        }
      }}
      style={{ display: "inline-flex" }}
    >
      <button
        ref={trigger}
        type="button"
        aria-label={t("trigger", { breakdown: format.list(breakdown) })}
        aria-expanded={isOpen}
        aria-controls={isOpen ? id : undefined}
        onFocus={openPreview}
        onClick={openPreview}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" && panel.current) {
            event.preventDefault();
            panel.current.focus({ preventScroll: true });
          }
        }}
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
          tabIndex={-1}
          onMouseEnter={() => clearTimeout(closeTimer.current)}
          style={{ ...card, ...position, position: "fixed", zIndex: 80, cursor: "default" }}
        >
          <div style={{ marginBottom: 6, fontSize: 10, textTransform: "uppercase", color: "var(--text-muted)" }}>
            {heading}
          </div>
          {scope === "pr" && prId && total > summary.preview.length ? (
            <PrFindingPreviewItems prId={prId} preview={summary.preview} />
          ) : (
            <FindingPreviewItems findings={summary.preview} />
          )}
        </div>,
        document.body,
      )}
    </span>
  );
}
