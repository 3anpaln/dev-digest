/* PRRow — one clickable row in the PR list table. Ported from screen_dashboard.jsx. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { Icon, Avatar, Badge, CircularScore } from "@devdigest/ui";
import type { PrListItem } from "@/lib/types";
import { SIZE_COLOR, STATUS_META } from "../../constants";
import { relativeTime, sizeOf } from "../../helpers";
import { s } from "../../styles";

const costFormat = {
  style: "currency", currency: "USD", minimumFractionDigits: 3, maximumFractionDigits: 3,
} as const;

function ReviewCost({ reviewCost }: { reviewCost: PrListItem["review_cost"] }) {
  const t = useTranslations("prReview.list.cost");
  const format = useFormatter();
  let value = "—";
  let label = t("none");
  if (reviewCost?.running) {
    value = "…";
    label = t("running");
  } else if (reviewCost) {
    const cost = reviewCost.cost_usd;
    if (cost != null) {
      value = cost > 0 && cost < 0.0005
        ? `<${format.number(0.001, costFormat)}`
        : format.number(cost, costFormat);
    }
    label = t("total", { amount: cost == null ? t("unavailable") : value });
  }
  return (
    <span className="mono" style={s.rowNumber} title={label}>
      <span className="sr-only">{label}</span>
      <span aria-hidden="true">{value}</span>
    </span>
  );
}

export function PRRow({ pr, repoId }: { pr: PrListItem; repoId: string }) {
  const t = useTranslations("prReview");
  const router = useRouter();
  const [h, setH] = React.useState(false);
  const st = STATUS_META[pr.status] ?? STATUS_META.needs_review!;
  const { size, lines } = sizeOf(pr);
  const reviewed = pr.score != null; // null score ⇒ PR has never been reviewed
  return (
    <div
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      onClick={() => router.push(`/repos/${repoId}/pulls/${pr.number}`)}
      style={s.row(h)}
    >
      <div style={s.rowTitleCell}>
        <Icon.GitPullRequest size={15} style={s.rowIcon(st.c)} />
        <div style={s.rowTitleWrap}>
          <div style={s.rowTitle(h)}>{pr.title}</div>
          <span className="mono" style={s.rowNumber}>
            #{pr.number}
          </span>
        </div>
      </div>
      <div style={s.authorCell}>
        <Avatar name={pr.author} size={18} />
        {pr.author}
      </div>
      <div>
        <Badge
          color={SIZE_COLOR[size]}
          bg="transparent"
          style={s.sizeBadgeBorder(SIZE_COLOR[size]!)}
        >
          {size} · {lines}
        </Badge>
      </div>
      <div style={s.scoreCell}>
        {reviewed ? (
          <CircularScore score={pr.score!} size={34} stroke={3} />
        ) : (
          <span style={s.muted}>—</span>
        )}
      </div>
      <div>
        <Badge dot color={st.c} bg="transparent">
          {t(`list.status.${st.labelKey}`)}
        </Badge>
      </div>
      <ReviewCost reviewCost={pr.review_cost} />
      <div style={s.updatedCell}>{relativeTime(pr.updated_at)}</div>
    </div>
  );
}
