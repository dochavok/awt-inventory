// Equipping (section 9): the paper doll and hands, arcane slots, rarity counts,
// the check before equipping, and over-limit alerts (EQ-1 to EQ-8). Pure
// functions. Permission warnings (EQ-9) and rarity limits (EQ-10, EQ-11) are M5.

import { NotFoundError } from "../errors";
import {
  countedGrants,
  entryName,
  equippedSlots,
  grantLine,
  isSituational,
  sourceKey,
  type SourcedGrant,
} from "./grants";
import type {
  ArcaneState,
  Block,
  BlockReason,
  CharacterSheet,
  Entry,
  EquipCheck,
  Id,
  LossReason,
  Occupant,
  OverLimitAlert,
  RarityState,
  ReferenceData,
  SheetChange,
  SlotKind,
  SlotKindState,
  SlotState,
  SlotTarget,
  SourceRef,
} from "./types";

const HANDS = ["main-hand", "off-hand"] as const;
const HAND_NAMES: Record<(typeof HANDS)[number], string> = { "main-hand": "Main hand", "off-hand": "Off hand" };

/** The slot kinds an equip target takes: both hands for a two-handed weapon, otherwise the target itself. */
function targetKinds(target: SlotTarget): SlotTarget[] {
  return target === "both-hands" ? [...HANDS] : [target];
}

/** "A", "A and B", "A, B and C". */
function listNames(names: string[]): string {
  return names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

/** The slot kinds a character has: the reference data's, with both hands (EQ-1), by ID. */
function slotKinds(ref: ReferenceData): Map<Id, SlotKind> {
  const kinds = new Map(ref.slotKinds.map((k) => [k.id, k]));
  for (const hand of HANDS) if (!kinds.has(hand)) kinds.set(hand, { id: hand, name: HAND_NAMES[hand] });
  return kinds;
}

function kindName(kinds: Map<Id, SlotKind>, id: SlotTarget): string {
  if (id === "both-hands") return "both hands";
  if (id === "arcane") return "an arcane slot";
  return kinds.get(id)?.name ?? id;
}

type SlotGrants = Map<Id | "arcane", { g: SourcedGrant; amount: number }[]>;

/**
 * The grants that add slots, by the slot kind they add to ("arcane" for arcane
 * slots), in one pass (GR-1). GR-1's grants are +n, so bad data that isn't a
 * whole number of 1 or more adds nothing.
 */
function slotGrants(counted: SourcedGrant[]): SlotGrants {
  const by: SlotGrants = new Map();
  for (const g of counted) {
    const { grant } = g;
    if (grant.kind !== "slots" && grant.kind !== "arcane-slots") continue;
    if (isSituational(grant) || !Number.isInteger(grant.amount) || grant.amount < 1) continue;
    const scope = grant.kind === "slots" ? grant.slotKind : "arcane";
    const list = by.get(scope);
    if (list) list.push({ g, amount: grant.amount });
    else by.set(scope, [{ g, amount: grant.amount }]);
  }
  return by;
}

/** The arcane slots the level chart gives: the class's start plus each level's (EQ-6). */
function chartArcaneSlots(sheet: CharacterSheet, ref: ReferenceData): { starting: number; fromLevels: number } {
  const chart = ref.levelChart[sheet.character.className];
  const fromLevels = chart.levels.filter((l) => l.arcaneSlot && l.level <= sheet.character.level).length;
  return { starting: chart.startingArcaneSlots, fromLevels };
}

/** Every slot kind, the arcane slots and the rarity allowances, with what's in them (EQ-1, EQ-5 to EQ-7, EQ-10). */
export function slotState(sheet: CharacterSheet, ref: ReferenceData): SlotState {
  return stateFrom(sheet, ref, countedGrants(sheet, ref));
}

/** slotState, given the character's counted grants. */
function stateFrom(sheet: CharacterSheet, ref: ReferenceData, counted: SourcedGrant[]): SlotState {
  const entries = new Map(sheet.entries.map((e) => [e.id, e]));
  const occupants = new Map<SlotTarget, Occupant[]>();
  const equippedEntries: Entry[] = [];
  for (const [entryId, slot] of equippedSlots(sheet)) {
    const entry = entries.get(entryId);
    if (!entry) continue;
    equippedEntries.push(entry);
    const occupant = { entryId, name: entryName(entry, ref) };
    for (const kind of targetKinds(slot)) {
      const list = occupants.get(kind);
      if (list) list.push(occupant);
      else occupants.set(kind, [occupant]);
    }
  }

  const bySlot = slotGrants(counted);
  const known = slotKinds(ref);
  // Retired kinds show only while something is in them; unknown ones too, so nothing equipped is hidden.
  const unknown = [...occupants.keys()]
    .filter((slot) => slot !== "arcane" && !known.has(slot))
    .map((id): SlotKind => ({ id, name: id, retired: true }));
  const kinds: SlotKindState[] = [...known.values(), ...unknown]
    .filter((k) => !k.retired || occupants.has(k.id))
    .map((k) => {
      const inIt = occupants.get(k.id) ?? [];
      const extra = (bySlot.get(k.id) ?? []).flatMap(({ g, amount }) => Array<SourceRef>(amount).fill(g.source));
      const allowed = 1 + extra.length;
      return {
        kind: k.id,
        name: k.name,
        allowed,
        equipped: inIt.length,
        slots: Array.from({ length: Math.max(allowed, inIt.length) }, (_, i) => {
          const source = i === 0 ? undefined : extra[i - 1];
          return {
            label: i === 0 ? k.name : `${k.name} ${i + 1}`,
            ...(source ? { source } : {}),
            ...(inIt[i] ? { occupant: inIt[i] } : {}),
          };
        }),
      };
    });

  const { starting, fromLevels } = chartArcaneSlots(sheet, ref);
  const arcaneGrants = (bySlot.get("arcane") ?? []).map(({ g, amount }) => grantLine(g, amount));
  const arcaneIn = occupants.get("arcane") ?? [];
  const arcane: ArcaneState = {
    allowed: starting + fromLevels + arcaneGrants.reduce((s, g) => s + g.amount, 0),
    used: arcaneIn.length,
    starting,
    fromLevels,
    grants: arcaneGrants,
    occupants: arcaneIn,
  };

  const rarities: RarityState[] = ref.rarities.flatMap((r) => {
    const equipped = equippedEntries.filter((e) => "rarity" in e && e.rarity === r.id).length;
    if (r.retired && equipped === 0) return [];
    let allowance = 0;
    for (const { grant } of counted) {
      if (grant.kind === "allowance" && grant.rarity === r.id && !isSituational(grant)) allowance += grant.amount;
    }
    return [{ rarity: r.id, name: r.name, allowed: r.limit === undefined ? null : r.limit + allowance, equipped }];
  });

  return { kinds, arcane, rarities };
}

/** A slot kind or the arcane slots: how many are allowed, how many are used, and by what. */
interface Capacity {
  scope: OverLimitAlert["scope"];
  key: Id | "arcane";
  name: string;
  allowed: number;
  equipped: number;
  occupants: Occupant[];
}

function capacities(state: SlotState): Capacity[] {
  return [
    ...state.kinds.map((k) => ({
      scope: { type: "slot-kind" as const, id: k.kind },
      key: k.kind,
      name: k.name,
      allowed: k.allowed,
      equipped: k.equipped,
      occupants: k.slots.flatMap((s) => (s.occupant ? [s.occupant] : [])),
    })),
    {
      scope: { type: "arcane" },
      key: "arcane",
      name: "Arcane slots",
      allowed: state.arcane.allowed,
      equipped: state.arcane.used,
      occupants: state.arcane.occupants,
    },
  ];
}

// ---------------------------------------------------------------- checkEquip

function block(reason: BlockReason, about: Id, message: string, occupants: Occupant[] = []): EquipCheck {
  return { outcome: "blocked", block: { reason, about, occupants, message } satisfies Block, warnings: [] };
}

const NOT_EQUIPPABLE: Record<Exclude<Entry["category"], "weapons" | "armor" | "items">, string> = {
  consumables: "is a consumable and can't be equipped",
  components: "is a component and can't be equipped",
  skills: "is a skill and can't be equipped",
  allies: "is an ally: allies are made active, not equipped",
};

/** Whether this entry can go in `target` at all (EQ-2, EQ-3, EQ-7), whatever's already there. */
function placementBlock(entry: Entry, name: string, target: SlotTarget, kinds: Map<Id, SlotKind>): EquipCheck | null {
  const where = kindName(kinds, target);
  switch (entry.category) {
    case "weapons":
      if (entry.hands === 2) {
        return target === "both-hands"
          ? null
          : block("wrong-slot", target, `${name} is two-handed, so it takes both hands.`);
      }
      return (HANDS as readonly string[]).includes(target)
        ? null
        : block("wrong-slot", target, `${name} is one-handed: it goes in the Main hand or the Off hand.`);
    case "armor": {
      const fits = kindName(kinds, entry.slotKind);
      return target === entry.slotKind ? null : block("wrong-slot", target, `${name} fits ${fits}, not ${where}.`);
    }
    case "items":
      if (entry.arcane) {
        return target === "arcane"
          ? null
          : block("wrong-slot", target, `${name} is arcane, so it goes in an arcane slot, not ${where}.`);
      }
      return target === "arcane"
        ? block("not-arcane", target, `${name} isn't arcane, so it can't go in an arcane slot.`)
        : block("cannot-equip", target, `${name} isn't arcane, so it can't be equipped.`);
    default:
      return block("cannot-equip", target, `${name} ${NOT_EQUIPPABLE[entry.category]}.`);
  }
}

const isShield = (e: Entry) => e.category === "armor" && e.slotKind === "off-hand";

/** EQ-8's count, e.g. "Back: 2 equipped, 1 allowed.", shared by the alert and the over-limit block. */
function countText(name: string, equipped: number, allowed: number): string {
  return `${name}: ${equipped} equipped, ${allowed} allowed.`;
}

/** Whether `entryId` may be equipped in `target`: blocked, or allowed with any warnings (EQ-2 to EQ-8). */
export function checkEquip(sheet: CharacterSheet, ref: ReferenceData, entryId: Id, target: SlotTarget): EquipCheck {
  const entry = sheet.entries.find((e) => e.id === entryId);
  if (!entry) throw new NotFoundError("entry", entryId);
  const name = entryName(entry, ref);
  const kinds = slotKinds(ref);

  const slots = equippedSlots(sheet);
  const current = slots.get(entryId);
  if (current !== undefined) {
    const there =
      current === "arcane" || current === "both-hands" ? kindName(kinds, current) : `the ${kindName(kinds, current)}`;
    return block(
      "already-equipped",
      targetKinds(current)[0]!,
      `${name} is already equipped in ${there}. Unequip it first.`,
    );
  }

  const misplaced = placementBlock(entry, name, target, kinds);
  if (misplaced) return misplaced;
  // RD-3: a retired slot kind (or one the reference data doesn't have) takes nothing new.
  const gone = targetKinds(target).find((k) => {
    const kind = kinds.get(k);
    return k !== "arcane" && (!kind || kind.retired === true);
  });
  if (gone) {
    const slot = kindName(kinds, gone);
    return block("wrong-slot", gone, `The ${slot} slot is no longer used, so ${name} can't be equipped there.`);
  }

  if (isShield(entry)) {
    // EQ-3: until Q2 is answered, a character can't hold two shields.
    const held = sheet.entries
      .filter((e) => slots.has(e.id) && isShield(e))
      .map((e) => ({ entryId: e.id, name: entryName(e, ref) }));
    if (held.length > 0) {
      const names = listNames(held.map((o) => o.name));
      return block(
        "two-shields",
        "off-hand",
        `${names} is already held, and a character can't hold two shields.`,
        held,
      );
    }
  }

  const all = capacities(slotState(sheet, ref));
  // Every target kind is shown here: the check above blocked the retired and unknown ones.
  const needed = targetKinds(target).flatMap((key) => all.filter((c) => c.key === key));
  const over = needed.find((c) => c.equipped > c.allowed);
  if (over) {
    const message = `${countText(over.name, over.equipped, over.allowed)} Unequip ${over.equipped - over.allowed} to clear the alert.`;
    return block("over-limit", over.key, message, over.occupants);
  }

  const full = needed.filter((c) => c.equipped >= c.allowed);
  if (full.length === 0) return { outcome: "allowed", warnings: [] };
  const first = full[0]!;
  const inThem = [...new Map(full.flatMap((c) => c.occupants).map((o) => [o.entryId, o])).values()];
  const names = listNames(inThem.map((o) => o.name));
  const verb = inThem.length === 1 ? "is" : "are";
  if (first.key === "arcane") {
    return block("arcane-full", "arcane", `Arcane slots are full: ${first.equipped} of ${first.allowed} used.`, inThem);
  }
  if (target === "both-hands") {
    const hands = listNames(full.map((c) => `the ${c.name}`));
    return block("hands-not-free", first.key, `${name} needs both hands free: ${names} ${verb} in ${hands}.`, inThem);
  }
  return block("slot-full", first.key, `${first.name} is full: ${names} ${verb} in it.`, inThem);
}

// ---------------------------------------------------------------- over-limit alerts (EQ-8)

/** What each source adds to a slot kind's allowance, or the arcane slots' (the level chart included). */
function allowanceBySource(sheet: CharacterSheet, ref: ReferenceData, bySlot: SlotGrants, scope: Id | "arcane") {
  const by = new Map<string, { source: SourceRef; amount: number }>();
  const add = (source: SourceRef, amount: number) => {
    const key = sourceKey(source);
    by.set(key, { source, amount: (by.get(key)?.amount ?? 0) + amount });
  };
  if (scope === "arcane") {
    const { starting, fromLevels } = chartArcaneSlots(sheet, ref);
    add({ type: "level-chart" }, starting + fromLevels);
  }
  for (const { g, amount } of bySlot.get(scope) ?? []) add(g.source, amount);
  return by;
}

const LOSS_VERBS: Record<LossReason, string> = {
  traded: "traded",
  "given-away": "gave away",
  unequipped: "unequipped",
  deleted: "deleted",
  "title-moved": "moved to another character",
  "title-removed": "removed",
  "grant-removed": "removed",
  "level-lowered": "changed",
  "class-corrected": "changed",
};

function cause(source: SourceRef, amount: number, reason: LossReason, arcane: boolean): string {
  if (source.type === "level-chart") {
    const what = reason === "class-corrected" ? "class was corrected" : "level was lowered";
    return ` The ${what}, so the level chart gives fewer arcane slots.`;
  }
  const slots = `${arcane ? "arcane " : ""}slot${amount === 1 ? "" : "s"}`;
  const from =
    source.type === "manual"
      ? `the grant "${source.reason}"`
      : source.type === "title"
        ? `the title ${source.name}`
        : source.name;
  return ` The extra ${slots} came from ${from}, which you ${LOSS_VERBS[reason]}.`;
}

/**
 * Slot kinds and arcane slots with more equipped than allowed (EQ-8). Given the
 * `change` that led here, each alert names the grant that was lost. Rarity
 * allowances (EQ-10) are M5.
 */
export function overLimitAlerts(sheet: CharacterSheet, ref: ReferenceData, change?: SheetChange): OverLimitAlert[] {
  const after = countedGrants(sheet, ref);
  const over = capacities(stateFrom(sheet, ref, after)).filter((c) => c.equipped > c.allowed);
  const before = change && over.length > 0 ? slotGrants(countedGrants(change.before, ref)) : undefined;
  const afterBySlot = before ? slotGrants(after) : undefined;

  return over.map(({ scope, key, name, equipped, allowed }) => {
    const base = { scope, equipped, allowed, message: countText(name, equipped, allowed) };
    if (!change || !before || !afterBySlot) return base;
    const now = allowanceBySource(sheet, ref, afterBySlot, key);
    for (const [k, was] of allowanceBySource(change.before, ref, before, key)) {
      const amount = was.amount - (now.get(k)?.amount ?? 0);
      if (amount > 0) {
        return {
          ...base,
          lost: { source: was.source, reason: change.reason },
          message: base.message + cause(was.source, amount, change.reason, key === "arcane"),
        };
      }
    }
    return base;
  });
}
