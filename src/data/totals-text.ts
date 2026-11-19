// A character's totals as text (GR-8 to GR-11): each with its breakdown by
// source category, for the printable sheet (EX-1) and the character's page.
// No PDF code here, so the screens can use it without pulling in the sheet's.

import { classBonusShown, dieSourceName } from "../rules/totals";
import type { BreakdownGroup, Total, Totals } from "../rules/types";

/** GR-8's source categories, as a total's breakdown and its grants (GR-12) name them. */
export const GROUP_NAMES: Record<BreakdownGroup, string> = {
  "class-bonus": "Class bonus",
  "level-chart": "Level chart",
  armor: "Armor",
  weapons: "Weapons",
  skills: "Skills",
  ally: "Ally",
  items: "Items",
  titles: "Titles",
  other: "Other",
};

export interface TotalRow {
  label: string;
  value: number | string;
  lines: { label: string; value: number | string }[];
}

/** CM, mitigation, max hearts and combat dice, each with its breakdown; the class bonus's line under its own name. */
export function totalRows(totals: Totals): { cm: TotalRow; mitigation: TotalRow; hearts: TotalRow; dice: TotalRow } {
  const { classBonus } = totals;
  const lines = (total: Total) =>
    total.lines.map((l) =>
      l.group === "class-bonus"
        ? { label: classBonus.name, value: classBonusShown(classBonus) }
        : { label: GROUP_NAMES[l.group], value: l.value },
    );
  const extra = totals.dice.extra.map((d) => ` + ${d.die} (${dieSourceName(d, classBonus)})`).join("");
  return {
    cm: { label: "CM", value: totals.cm.value, lines: lines(totals.cm) },
    mitigation: { label: "Mitigation", value: totals.mitigation.value, lines: lines(totals.mitigation) },
    hearts: { label: "Max hearts", value: totals.hearts.value, lines: lines(totals.hearts) },
    dice: { label: "Combat dice", value: `${totals.dice.base}${extra}`, lines: [] },
  };
}
