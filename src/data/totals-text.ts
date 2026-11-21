// A character's totals as text (GR-8 to GR-11, GR-13): each with its breakdown
// by source category, for the printable sheet (EX-1) and the character's page.
// No PDF code here, so the screens can use it without pulling in the sheet's.

import { classBonusShown, dieSourceName, sourceName } from "../rules/totals";
import type { BreakdownGroup, DamageLine, SourceRef, Total, Totals } from "../rules/types";

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

const SOURCE_PREFIX: Record<SourceRef["type"], string> = {
  entry: "",
  title: "Title: ",
  skill: "Skill: ",
  manual: "Manual grant: ",
  "level-chart": "",
};

/**
 * Where a grant comes from, as slots say it (EQ-5): an entry by its name, otherwise what it
 * is and its name, e.g. "Title: Wanderer".
 */
export function sourceLabel(source: SourceRef): string {
  return SOURCE_PREFIX[source.type] + sourceName(source);
}

/** n hearts, e.g. "1 heart" or "4 hearts". */
export const hearts = (n: number) => `${n} ${n === 1 ? "heart" : "hearts"}`;

/** Extra damage's amount and type (GR-13), e.g. "+1 heart fire" or "+2 hearts". */
export const damageText = ({ amount, damageType }: { amount: number; damageType?: string }) =>
  `+${hearts(amount)}${damageType ? ` ${damageType}` : ""}`;

/** Where extra damage comes from, and its condition if it has one, e.g. "Title: Wanderer, vs Undead". */
export const damageSource = (d: DamageLine) =>
  [sourceLabel(d.source), ...(d.condition ? [d.condition] : [])].join(", ");

export interface TotalRow {
  label: string;
  value: number | string;
  lines: { label: string; value: number | string }[];
}

/**
 * CM, mitigation, max hearts, combat dice and damage, each with its breakdown; the class
 * bonus's line under its own name. Damage's lines are the base, then each extra damage that
 * counts, e.g. "+1 heart fire" "(Title: Ember Mark)" (GR-13).
 */
export function totalRows(totals: Totals): {
  cm: TotalRow;
  mitigation: TotalRow;
  hearts: TotalRow;
  dice: TotalRow;
  damage: TotalRow;
} {
  const { classBonus, damage } = totals;
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
    damage: {
      label: "Damage",
      value: hearts(damage.value),
      lines: [
        { label: "base", value: damage.base },
        ...damage.grants.map((d) => ({ label: damageText(d), value: `(${damageSource(d)})` })),
      ],
    },
  };
}
