"use client";

import { useFormatter, useTranslations } from "next-intl";

export function RunCostAmount({ cost, digits }: { cost: number | null; digits: 3 | 4 }) {
  const format = useFormatter();
  const t = useTranslations("prReview.timeline");
  const options = {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  } as const;
  const unit = 10 ** -digits;
  let amount = "—";
  if (cost != null) {
    amount = cost > 0 && cost < unit / 2
      ? `<${format.number(unit, options)}`
      : format.number(cost, options);
  }

  return (
    <span className="mono" style={{ color: "var(--text-muted)", fontSize: 11, whiteSpace: "nowrap" }}
      title={t("cost", { amount: cost == null ? t("costUnavailable") : amount })}>
      {amount}
    </span>
  );
}
