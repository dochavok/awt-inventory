// How grants and totals read on screen (sections 8 and 9): a grant's text, where
// one comes from, and each total with its breakdown and every grant in it
// (GR-7 to GR-12). Plain functions, so the user guide's examples come from the
// same code as the screens (DOC-4).

import { GROUP_NAMES, totalRows, type TotalRow } from "../data/totals-text";
import { classBonusShown, dieSourceName, sourceName } from "../rules/totals";
import type {
  Effect,
  Grant,
  GrantLine,
  NewGrant,
  Permission,
  ReferenceData,
  SourceRef,
  Total,
  Totals,
} from "../rules/types";

/** GR-1's kinds as the grant form offers them, in GR-1's order. Effects (GR-6) come in M5. */
export const KIND_NAMES: Record<Exclude<NewGrant["kind"], "effect">, string> = {
  cm: "CM",
  mitigation: "Mitigation",
  hearts: "Max hearts",
  die: "Extra die",
  slots: "Slots",
  "arcane-slots": "Arcane slots",
  allowance: "Rarity allowance",
  permission: "Permission",
};

/** GR-1's permissions, as the game names them. */
export const PERMISSION_NAMES: Record<Permission, string> = {
  "weapon-use": "Weapon Use",
  "ranged-weapon-use": "Ranged Weapon Use",
  "armor-use": "Armor Use",
  "dual-wielding": "Dual Wielding",
};

const EFFECT_NAMES: Record<Effect, string> = {
  resistance: "Resistance",
  immunity: "Immunity",
  "cr-bonus": "CR bonus",
};

/** A reference data entry's name by its ID, or the ID if the list doesn't have it. */
export const named = (list: { id: string; name: string }[], id: string) => list.find((x) => x.id === id)?.name ?? id;
const plural = (n: number, word: string) => `${word}${n === 1 ? "" : "s"}`;

/** A grant as the app lists it, e.g. "CM +2", "+1 Back slot", "Extra die 1d6 (vs Undead)". */
export function grantText(grant: Grant | NewGrant, ref: ReferenceData): string {
  let text: string;
  switch (grant.kind) {
    case "cm":
      text = `CM +${grant.amount}`;
      break;
    case "mitigation":
      text = `Mitigation +${grant.amount}`;
      break;
    case "hearts":
      text = `Max hearts +${grant.amount}`;
      break;
    case "die":
      text = `Extra die ${grant.die}`;
      break;
    case "slots":
      text = `+${grant.amount} ${named(ref.slotKinds, grant.slotKind)} ${plural(grant.amount, "slot")}`;
      break;
    case "arcane-slots":
      text = `+${grant.amount} arcane ${plural(grant.amount, "slot")}`;
      break;
    case "allowance":
      text = `+${grant.amount} ${named(ref.rarities, grant.rarity)} allowance`;
      break;
    case "permission":
      text = `Permission: ${PERMISSION_NAMES[grant.permission]}`;
      break;
    case "effect":
      text = `${EFFECT_NAMES[grant.effect]}: ${grant.text}`;
      break;
  }
  return grant.condition ? `${text} (${grant.condition})` : text;
}

const SOURCE_PREFIX: Record<SourceRef["type"], string> = {
  entry: "",
  title: "Title: ",
  skill: "Skill: ",
  manual: "Manual grant: ",
  "level-chart": "",
};

/**
 * Where an extra slot comes from (EQ-5): an entry by its name, otherwise what it is and
 * its name, e.g. "Title: Wanderer".
 */
export function sourceLabel(source: SourceRef): string {
  return SOURCE_PREFIX[source.type] + sourceName(source);
}

/**
 * One grant in a total (GR-12): its source, its category and its amount, and its
 * condition if it's situational, e.g. "Wanderer's Mail · Armor · +3 · vs Undead".
 */
function grantLineText(line: GrantLine, classBonus: Totals["classBonus"]): string {
  const isClassBonus = line.group === "class-bonus";
  const source = isClassBonus ? classBonus.name : sourceName(line.source);
  const group = GROUP_NAMES[line.group];
  const amount = isClassBonus && classBonus.dice ? classBonusShown(classBonus) : `+${line.amount}`;
  const parts = source === group ? [source, amount] : [source, group, amount];
  if (line.condition) parts.push(line.condition);
  return parts.join(" · ");
}

export interface TotalView {
  /** "CM", "Mitigation" or "Max hearts". */
  label: string;
  /** e.g. "CM 170" (GR-8). */
  heading: string;
  /** e.g. "Combat Bonus 63, Armor 71": shown when the total has more than one line, since one is the total itself. */
  breakdown?: string;
  /** Every grant counted in it (GR-12). */
  grants: string[];
  /** Situational grants that would affect it, never counted (GR-4). */
  situational: string[];
}

/** The class bonus, CM, mitigation, max hearts and combat dice, as the character's page shows them. */
export function totalsView(totals: Totals): {
  classBonus: string;
  totals: TotalView[];
  dice: string;
  situationalDice: string[];
} {
  const { classBonus } = totals;
  const rows = totalRows(totals);
  const view = (row: TotalRow, total: Total): TotalView => {
    const out: TotalView = {
      label: row.label,
      heading: `${row.label} ${row.value}`,
      grants: total.grants.map((g) => grantLineText(g, classBonus)),
      situational: total.situational.map((g) => grantLineText(g, classBonus)),
    };
    if (row.lines.length > 1) out.breakdown = row.lines.map((l) => `${l.label} ${l.value}`).join(", ");
    return out;
  };
  return {
    // GR-7: always under the class's own name, and with dice as dice plus a number.
    classBonus: `${classBonus.name} ${classBonusShown(classBonus)}`,
    totals: [view(rows.cm, totals.cm), view(rows.mitigation, totals.mitigation), view(rows.hearts, totals.hearts)],
    dice: `${rows.dice.label} ${rows.dice.value}`,
    situationalDice: totals.dice.situational.map(
      (d) => `${d.die} (${dieSourceName(d, classBonus)}${d.condition ? `, ${d.condition}` : ""})`,
    ),
  };
}
