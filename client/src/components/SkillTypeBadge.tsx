import { Badge } from "@devdigest/ui";
import type { SkillType } from "@devdigest/shared";

export const SKILL_TYPES = ["rubric", "convention", "security", "custom"] as const satisfies readonly SkillType[];

const TYPE_COLORS = {
  rubric: ["var(--accent-text)", "var(--accent-bg)"],
  convention: ["var(--ok)", "var(--ok-bg)"],
  security: ["var(--crit)", "var(--crit-bg)"],
  custom: ["var(--warn)", "var(--warn-bg)"],
} satisfies Record<SkillType, [string, string]>;

export function SkillTypeBadge({ type }: { type: SkillType }) {
  const [color, bg] = TYPE_COLORS[type];
  return <Badge color={color} bg={bg} style={{ fontSize: 11, padding: "2px 5px" }}>{type}</Badge>;
}
