// How grants and totals read on screen (sections 8 and 9): a grant's text, where
// one comes from, and each total with its breakdown and every grant in it
// (GR-7 to GR-13). Plain functions, so the user guide's examples come from the
// same code as the screens (DOC-4).

import { damageSource, damageText, GROUP_NAMES, sourceLabel, totalRows, type TotalRow } from "../data/totals-text";
import { classBonusShown, dieSourceName, sourceName } from "../rules/totals";
import type {
  ArcaneState,
  SlotView,
  Effect,
  Grant,
  GrantLine,
  NewGrant,
  Permission,
  ReferenceData,
  Total,
  Totals,
} from "../rules/types";

export { sourceLabel };

/** GR-1's kinds as the grant form offers them, in GR-1's order, then effects (GR-6). */
export const KIND_NAMES: Record<NewGrant["kind"], string> = {
  cm: "CM",
  mitigation: "Mitigation",
  hearts: "Max hearts",
  die: "Extra die",
  slots: "Slots",
  "arcane-slots": "Arcane slots",
  allowance: "Rarity allowance",
  permission: "Permission",
  "extra-damage": "Extra damage",
  effect: "Effect",
};

/** GR-1's permissions, as the game names them. */
export const PERMISSION_NAMES: Record<Permission, string> = {
  "weapon-use": "Weapon Use",
  "ranged-weapon-use": "Ranged Weapon Use",
  "armor-use": "Armor Use",
  "dual-wielding": "Dual Wielding",
};

/** GR-6's effects, as the game names them. */
export const EFFECT_NAMES: Record<Effect, string> = {
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
      // A value the app doesn't know (an older record) shows as stored, like `named`.
      text = `Permission: ${PERMISSION_NAMES[grant.permission] ?? grant.permission}`;
      break;
    case "extra-damage":
      text = `Extra damage ${damageText(grant)}`;
      break;
    case "effect":
      text = `${EFFECT_NAMES[grant.effect] ?? grant.effect}: ${grant.text}`;
      break;
  }
  return grant.condition ? `${text} (${grant.condition})` : text;
}

/** EQ-7's count, e.g. "Arcane slots: 3 of 4 used". */
export const arcaneCount = (arcane: Pick<ArcaneState, "used" | "allowed">) =>
  `Arcane slots: ${arcane.used} of ${arcane.allowed} used`;

/**
 * A paper-doll slot's text, as the equipment page shows it (EQ-5): its label, where it comes
 * from if a grant gives it, and what's in it or "Empty".
 */
export function slotParts(slot: SlotView): { label: string; from?: string; holds: string } {
  return {
    label: slot.label,
    ...(slot.source ? { from: `from ${sourceLabel(slot.source)}` } : {}),
    holds: slot.occupant?.name ?? "Empty",
  };
}

/** A paper-doll slot as one line, for the guide, e.g. "Back 2: Grey Cloak (from Wayfarer's Sash)". */
export function slotLine(slot: SlotView): string {
  const { label, from, holds } = slotParts(slot);
  return `${label}: ${holds}${from ? ` (${from})` : ""}`;
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

/**
 * The effects that apply now (GR-6), each with where it comes from as slots say it (EQ-5),
 * e.g. "Immunity: fall damage · Moth Cape" or "CR bonus: +1 · Manual grant: DM ruling".
 */
export function effectLines(totals: Totals, ref: ReferenceData): string[] {
  return totals.effects.map(
    ({ source, ...effect }) => `${grantText({ kind: "effect", ...effect }, ref)} · ${sourceLabel(source)}`,
  );
}

export interface TotalView {
  /** "CM", "Mitigation" or "Max hearts". */
  label: string;
  /** e.g. "CM 170" (GR-8). */
  heading: string;
  /** e.g. "Combat Bonus 63, Armor 71" (GR-8 to GR-10); none when it would be only the class bonus, shown on its own. */
  breakdown?: string;
  /** Every grant counted in it (GR-12). */
  grants: string[];
  /** Situational grants that would affect it, never counted (GR-4). */
  situational: string[];
}

/** The class bonus, CM, mitigation, max hearts, combat dice and damage, as the character's page shows them. */
export function totalsView(totals: Totals): {
  classBonus: string;
  totals: TotalView[];
  dice: string;
  situationalDice: string[];
  /** GR-13: e.g. "Damage 3 hearts", then "base 1" and a line for each extra damage that counts. */
  damage: { heading: string; lines: string[]; situational: string[] };
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
    // A breakdown that's only the class bonus says no more than the class bonus's own line.
    const onlyClassBonus = total.lines.length === 1 && total.lines[0]!.group === "class-bonus";
    if (row.lines.length > 0 && !onlyClassBonus) {
      out.breakdown = row.lines.map((l) => `${l.label} ${l.value}`).join(", ");
    }
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
    damage: {
      heading: `${rows.damage.label} ${rows.damage.value}`,
      lines: rows.damage.lines.map((l) => `${l.label} ${l.value}`),
      situational: totals.damage.situational.map((d) => `${damageText(d)} (${damageSource(d)})`),
    },
  };
}
