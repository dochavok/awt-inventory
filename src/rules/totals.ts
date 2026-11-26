// Totals (section 8.2): class bonus, CM, mitigation, max hearts and combat dice,
// each with its breakdown and every grant in it (GR-7 to GR-12), plus the
// damage (GR-13), and the permissions and effects that apply. Pure functions.

import { countedGrants, grantLine, isSituational, withCondition, type SourcedGrant } from "./grants";
import {
  BREAKDOWN_ORDER,
  PERMISSIONS,
  type BreakdownGroup,
  type CharacterSheet,
  type ClassBonusName,
  type ClassName,
  type DamageLine,
  type ExtraDie,
  type GrantLine,
  type LevelRow,
  type Permission,
  type ReferenceData,
  type SourceRef,
  type TextDamageLine,
  type Total,
  type Totals,
} from "./types";

/** GR-13: a character's damage before any extra, in hearts. */
export const BASE_DAMAGE = 1;

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

/** Class bonus, CM, mitigation, hearts, dice, damage, permissions and effects (GR-1 to GR-13, EQ-9, GR-6). */
export function computeTotals(sheet: CharacterSheet, ref: ReferenceData): Totals {
  const { className, level } = sheet.character;
  const row = levelRow(ref, className, level);
  const counted = countedGrants(sheet, ref);

  // GR-8, GR-11: the class bonus's dice (a Rogue's Stealth Bonus) are rolled with the combat dice, listed first.
  const extra: ExtraDie[] = row.classBonusDice ? [{ die: row.classBonusDice, source: { type: "level-chart" } }] : [];
  const situationalDice: ExtraDie[] = [];
  const permissions = new Map<Permission, Totals["permissions"][number]["sources"]>();
  const damage: DamageLine[] = [];
  const situationalDamage: DamageLine[] = [];
  const textDamage: TextDamageLine[] = [];
  const effects: Totals["effects"] = [];
  for (const { grant, source } of counted) {
    if (grant.kind === "die") {
      (isSituational(grant) ? situationalDice : extra).push({ die: grant.die, source, ...withCondition(grant) });
    } else if (grant.kind === "permission" && !isSituational(grant)) {
      const sources = permissions.get(grant.permission);
      if (sources) sources.push(source);
      else permissions.set(grant.permission, [source]);
    } else if (grant.kind === "extra-damage") {
      // The type comes trimmed: the store's checks and the skill list's schema both trim it.
      const { damageType } = grant;
      const line = { ...(damageType ? { damageType } : {}), source, ...withCondition(grant) };
      // GR-1: extra damage given as text has no number, so it's only ever listed.
      if ("amountText" in grant) textDamage.push({ amountText: grant.amountText, ...line });
      else (isSituational(grant) ? situationalDamage : damage).push({ amount: grant.amount, ...line });
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
    // GR-13: whatever its type, each extra damage that counts adds to the base.
    damage: {
      base: BASE_DAMAGE,
      value: damage.reduce((sum, d) => sum + d.amount, BASE_DAMAGE),
      grants: damage,
      situational: situationalDamage,
      situationalText: textDamage,
    },
    effects,
  };
}
