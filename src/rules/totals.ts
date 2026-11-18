// Totals (section 8.2): class bonus, CM, mitigation, max hearts and combat dice,
// each with its breakdown and every grant in it (GR-7 to GR-12), plus the
// permissions and effects that apply. Pure functions.

import { countedGrants, isSituational, type SourcedGrant } from "./grants";
import {
  BREAKDOWN_ORDER,
  type BreakdownGroup,
  type CharacterSheet,
  type ClassBonusName,
  type ClassName,
  type ExtraDie,
  type GrantLine,
  type LevelRow,
  type Permission,
  type ReferenceData,
  type Total,
  type Totals,
} from "./types";

const CLASS_BONUS_NAMES: Record<ClassName, ClassBonusName> = {
  Warrior: "Combat Bonus",
  Mage: "Arcane Bonus",
  Rogue: "Stealth Bonus",
};

const PERMISSION_ORDER: readonly Permission[] = ["weapon-use", "ranged-weapon-use", "armor-use", "dual-wielding"];

/** The chart row for a class and level: the highest row at or below the level, else the lowest. */
export function levelRow(ref: ReferenceData, className: ClassName, level: number): LevelRow {
  const rows = ref.levelChart[className].levels;
  let best: LevelRow | undefined;
  for (const row of rows) {
    if (row.level <= level && (!best || row.level > best.level)) best = row;
  }
  return best ?? rows.reduce((a, b) => (b.level < a.level ? b : a));
}

function line(g: SourcedGrant, amount: number): GrantLine {
  return {
    source: g.source,
    group: g.group,
    grantId: g.grant.id,
    amount,
    ...(g.grant.condition !== undefined ? { condition: g.grant.condition } : {}),
  };
}

type AmountKind = "cm" | "mitigation" | "hearts";

/** One total from the grants of `kind`, with the level chart's own line first when it isn't zero. */
function total(counted: SourcedGrant[], kind: AmountKind, chart?: { group: BreakdownGroup; amount: number }): Total {
  const grants: GrantLine[] = [];
  const situational: GrantLine[] = [];
  if (chart && chart.amount !== 0) grants.push({ source: { type: "level-chart" }, ...chart });
  for (const g of counted) {
    if (g.grant.kind !== kind) continue;
    (isSituational(g.grant) ? situational : grants).push(line(g, g.grant.amount));
  }
  const sums = new Map<BreakdownGroup, number>();
  for (const g of grants) sums.set(g.group, (sums.get(g.group) ?? 0) + g.amount);
  return {
    value: grants.reduce((s, g) => s + g.amount, 0),
    lines: BREAKDOWN_ORDER.flatMap((group) => {
      const value = sums.get(group) ?? 0;
      return value !== 0 ? [{ group, value }] : [];
    }),
    grants,
    situational,
  };
}

/** Class bonus, CM, mitigation, hearts, dice, permissions and effects (GR-1 to GR-12, EQ-9, GR-6). */
export function computeTotals(sheet: CharacterSheet, ref: ReferenceData): Totals {
  const { className, level } = sheet.character;
  const row = levelRow(ref, className, level);
  const counted = countedGrants(sheet, ref);

  const extra: ExtraDie[] = [];
  const situationalDice: ExtraDie[] = [];
  const permissions = new Map<Permission, Totals["permissions"][number]["sources"]>();
  const effects: Totals["effects"] = [];
  for (const { grant, source } of counted) {
    const condition = grant.condition !== undefined ? { condition: grant.condition } : {};
    if (grant.kind === "die") {
      (isSituational(grant) ? situationalDice : extra).push({ die: grant.die, source, ...condition });
    } else if (grant.kind === "permission" && !isSituational(grant)) {
      permissions.set(grant.permission, [...(permissions.get(grant.permission) ?? []), source]);
    } else if (grant.kind === "effect") {
      effects.push({ effect: grant.effect, text: grant.text, source, ...condition });
    }
  }

  return {
    classBonus: { name: CLASS_BONUS_NAMES[className], value: row.classBonus },
    cm: total(counted, "cm", { group: "class-bonus", amount: row.classBonus }),
    mitigation: total(counted, "mitigation"),
    hearts: total(counted, "hearts", { group: "level-chart", amount: row.hearts }),
    dice: { base: row.dice, extra, situational: situationalDice },
    permissions: PERMISSION_ORDER.flatMap((permission) => {
      const sources = permissions.get(permission);
      return sources ? [{ permission, sources }] : [];
    }),
    effects,
  };
}
