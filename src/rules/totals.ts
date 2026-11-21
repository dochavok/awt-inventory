// Totals (section 8.2): class bonus, CM, mitigation, max hearts and combat dice,
// each with its breakdown and every grant in it (GR-7 to GR-12), plus the
// permissions, extra damage (GR-13) and effects that apply. Pure functions.

import { countedGrants, grantLine, isSituational, withCondition, type SourcedGrant } from "./grants";
import {
  BREAKDOWN_ORDER,
  PERMISSIONS,
  type BreakdownGroup,
  type CharacterSheet,
  type ClassBonusName,
  type ClassName,
  type ExtraDie,
  type GrantLine,
  type LevelRow,
  type Permission,
  type ReferenceData,
  type SourceRef,
  type Total,
  type Totals,
} from "./types";

const CLASS_BONUS_NAMES: Record<ClassName, ClassBonusName> = {
  Warrior: "Combat Bonus",
  Mage: "Arcane Bonus",
  Rogue: "Stealth Bonus",
};

/** The chart row for a class and level: the highest row at or below the level, else the lowest. */
function levelRow(ref: ReferenceData, className: ClassName, level: number): LevelRow {
  const rows = ref.levelChart[className].levels;
  let best: LevelRow | undefined;
  for (const row of rows) {
    if (row.level <= level && (!best || row.level > best.level)) best = row;
  }
  return best ?? rows.reduce((a, b) => (b.level < a.level ? b : a));
}

type AmountKind = "cm" | "mitigation" | "hearts";

/** One total from the grants of `kind`, with the level chart's own line first when it isn't zero. */
function total(counted: SourcedGrant[], kind: AmountKind, chart?: { group: BreakdownGroup; amount: number }): Total {
  const grants: GrantLine[] = [];
  const situational: GrantLine[] = [];
  if (chart && chart.amount !== 0) grants.push({ source: { type: "level-chart" }, ...chart });
  for (const g of counted) {
    if (g.grant.kind !== kind) continue;
    (isSituational(g.grant) ? situational : grants).push(grantLine(g, g.grant.amount));
  }
  const sums = new Map<BreakdownGroup, number>();
  let value = 0;
  for (const g of grants) {
    sums.set(g.group, (sums.get(g.group) ?? 0) + g.amount);
    value += g.amount;
  }
  return {
    value,
    lines: BREAKDOWN_ORDER.flatMap((group) => {
      const value = sums.get(group) ?? 0;
      return value !== 0 ? [{ group, value }] : [];
    }),
    grants,
    situational,
  };
}

/** A grant's source as the app names it: an entry, skill or title by name, a manual grant by its reason. */
export function sourceName(source: SourceRef): string {
  return source.type === "manual" ? source.reason : source.type === "level-chart" ? "Level chart" : source.name;
}

/** GR-7: the class bonus as shown: its number, or with dice always both, e.g. "1d4 + 3". */
export function classBonusShown(classBonus: Totals["classBonus"]): number | string {
  return classBonus.dice ? `${classBonus.dice} + ${classBonus.value}` : classBonus.value;
}

/** GR-11: where an extra die comes from; the level chart's own is the class bonus's (e.g. Stealth Bonus). */
export function dieSourceName(die: ExtraDie, classBonus: Totals["classBonus"]): string {
  return die.source.type === "level-chart" ? classBonus.name : sourceName(die.source);
}

/** Class bonus, CM, mitigation, hearts, dice, permissions, extra damage and effects (GR-1 to GR-13, EQ-9, GR-6). */
export function computeTotals(sheet: CharacterSheet, ref: ReferenceData): Totals {
  const { className, level } = sheet.character;
  const row = levelRow(ref, className, level);
  const counted = countedGrants(sheet, ref);

  // GR-8, GR-11: the class bonus's dice (a Rogue's Stealth Bonus) are rolled with the combat dice, listed first.
  const extra: ExtraDie[] = row.classBonusDice ? [{ die: row.classBonusDice, source: { type: "level-chart" } }] : [];
  const situationalDice: ExtraDie[] = [];
  const permissions = new Map<Permission, Totals["permissions"][number]["sources"]>();
  const extraDamage: Totals["extraDamage"] = [];
  const effects: Totals["effects"] = [];
  for (const { grant, source } of counted) {
    if (grant.kind === "die") {
      (isSituational(grant) ? situationalDice : extra).push({ die: grant.die, source, ...withCondition(grant) });
    } else if (grant.kind === "permission" && !isSituational(grant)) {
      const sources = permissions.get(grant.permission);
      if (sources) sources.push(source);
      else permissions.set(grant.permission, [source]);
    } else if (grant.kind === "extra-damage") {
      // GR-13: listed with its condition, if any, like every other; never added together.
      const damageType = grant.damageType?.trim();
      extraDamage.push({
        amount: grant.amount,
        ...(damageType ? { damageType } : {}),
        source,
        ...withCondition(grant),
      });
    } else if (grant.kind === "effect") {
      effects.push({ effect: grant.effect, text: grant.text, source, ...withCondition(grant) });
    }
  }

  return {
    classBonus: {
      name: CLASS_BONUS_NAMES[className],
      value: row.classBonus,
      ...(row.classBonusDice ? { dice: row.classBonusDice } : {}),
    },
    cm: total(counted, "cm", { group: "class-bonus", amount: row.classBonus }),
    mitigation: total(counted, "mitigation"),
    hearts: total(counted, "hearts", { group: "level-chart", amount: row.hearts }),
    dice: { base: row.dice, extra, situational: situationalDice },
    permissions: PERMISSIONS.flatMap((permission) => {
      const sources = permissions.get(permission);
      return sources ? [{ permission, sources }] : [];
    }),
    extraDamage,
    effects,
  };
}
