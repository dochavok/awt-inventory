// Equipping (section 9): the paper doll and hands, arcane slots, rarity counts,
// the check before equipping, and over-limit alerts (EQ-1 to EQ-8). Pure
// functions. Permission warnings (EQ-9) and rarity limits (EQ-10, EQ-11) are M5.

import { NotFoundError } from "../errors";
import { countedGrants, equippedSlots, isSituational, sourceKey, type SourcedGrant } from "./grants";
import type {
  ArcaneState,
  Block,
  BlockReason,
  CharacterSheet,
  Entry,
  EquipCheck,
  GrantLine,
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

function entryName(entry: Entry, ref: ReferenceData): string {
  return entry.category === "skills"
    ? (ref.skills.find((s) => s.id === entry.skillId)?.name ?? entry.skillId)
    : entry.name;
}

/** "A", "A and B", "A, B and C". */
function listNames(names: string[]): string {
  return names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

/** The slot kinds a character has: the reference data's, with both hands (EQ-1). */
function slotKinds(ref: ReferenceData): SlotKind[] {
  const kinds = [...ref.slotKinds];
  for (const hand of HANDS) if (!kinds.some((k) => k.id === hand)) kinds.push({ id: hand, name: HAND_NAMES[hand] });
  return kinds;
}

function kindName(ref: ReferenceData, id: SlotTarget): string {
  if (id === "both-hands") return "both hands";
  if (id === "arcane") return "an arcane slot";
  return slotKinds(ref).find((k) => k.id === id)?.name ?? id;
}

function grantLine(g: SourcedGrant, amount: number): GrantLine {
  return { source: g.source, group: g.group, grantId: g.grant.id, amount };
}

/** What each grant adds to a slot kind or the arcane slots, before conditions are checked. */
function slotGrants(counted: SourcedGrant[], scope: Id | "arcane"): { g: SourcedGrant; amount: number }[] {
  return counted.flatMap((g) => {
    if (isSituational(g.grant)) return [];
    if (scope === "arcane" && g.grant.kind === "arcane-slots") return [{ g, amount: g.grant.amount }];
    if (g.grant.kind === "slots" && g.grant.slotKind === scope) return [{ g, amount: g.grant.amount }];
    return [];
  });
}

/** The arcane slots the level chart gives: the class's start plus each level's (EQ-6). */
function chartArcaneSlots(sheet: CharacterSheet, ref: ReferenceData): { starting: number; fromLevels: number } {
  const chart = ref.levelChart[sheet.character.className];
  const fromLevels = chart.levels.filter((l) => l.arcaneSlot && l.level <= sheet.character.level).length;
  return { starting: chart.startingArcaneSlots, fromLevels };
}

/** Every slot kind, the arcane slots and the rarity allowances, with what's in them (EQ-1, EQ-5 to EQ-7, EQ-10). */
export function slotState(sheet: CharacterSheet, ref: ReferenceData): SlotState {
  const counted = countedGrants(sheet, ref);
  const entries = new Map(sheet.entries.map((e) => [e.id, e]));
  const occupants = new Map<SlotTarget, Occupant[]>();
  const place = (slot: SlotTarget, o: Occupant) => occupants.set(slot, [...(occupants.get(slot) ?? []), o]);
  const equippedEntries: Entry[] = [];
  for (const [entryId, slot] of equippedSlots(sheet)) {
    const entry = entries.get(entryId);
    if (!entry) continue;
    equippedEntries.push(entry);
    const occupant = { entryId, name: entryName(entry, ref) };
    if (slot === "both-hands") for (const hand of HANDS) place(hand, occupant);
    else place(slot, occupant);
  }

  const known = slotKinds(ref);
  // Retired kinds show only while something is in them; unknown ones too, so nothing equipped is hidden.
  const unknown = [...occupants.keys()]
    .filter((slot) => slot !== "arcane" && !known.some((k) => k.id === slot))
    .map((id): SlotKind => ({ id, name: id, retired: true }));
  const kinds: SlotKindState[] = [...known, ...unknown]
    .filter((k) => !k.retired || occupants.has(k.id))
    .map((k) => {
      const inIt = occupants.get(k.id) ?? [];
      const extra = slotGrants(counted, k.id).flatMap(({ g, amount }) => Array<SourceRef>(amount).fill(g.source));
      const allowed = 1 + extra.length;
      const sources: (SourceRef | undefined)[] = [undefined, ...extra];
      return {
        kind: k.id,
        name: k.name,
        allowed,
        equipped: inIt.length,
        slots: Array.from({ length: Math.max(allowed, inIt.length) }, (_, i) => ({
          label: i === 0 ? k.name : `${k.name} ${i + 1}`,
          ...(sources[i] ? { source: sources[i] } : {}),
          ...(inIt[i] ? { occupant: inIt[i] } : {}),
        })),
      };
    });

  const { starting, fromLevels } = chartArcaneSlots(sheet, ref);
  const arcaneGrants = slotGrants(counted, "arcane").map(({ g, amount }) => grantLine(g, amount));
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
    const allowance = counted.reduce(
      (s, { grant }) =>
        s + (grant.kind === "allowance" && grant.rarity === r.id && !isSituational(grant) ? grant.amount : 0),
      0,
    );
    return [{ rarity: r.id, name: r.name, allowed: r.limit === undefined ? null : r.limit + allowance, equipped }];
  });

  return { kinds, arcane, rarities };
}

// ---------------------------------------------------------------- checkEquip

function block(reason: BlockReason, about: Id, message: string, occupants: Occupant[] = []): EquipCheck {
  return { outcome: "blocked", block: { reason, about, occupants, message } satisfies Block, warnings: [] };
}

const NOT_EQUIPPABLE: Partial<Record<Entry["category"], string>> = {
  consumables: "is a consumable and can't be equipped",
  components: "is a component and can't be equipped",
  skills: "is a skill and can't be equipped",
  allies: "is an ally: allies are made active, not equipped",
};

/** Which slot kinds `target` takes for this entry (EQ-2, EQ-3, EQ-7), or why it can't go there. */
function placement(entry: Entry, name: string, target: SlotTarget, ref: ReferenceData): EquipCheck | Id[] {
  const where = kindName(ref, target);
  switch (entry.category) {
    case "weapons":
      if (entry.hands === 2) {
        return target === "both-hands"
          ? [...HANDS]
          : block("wrong-slot", target, `${name} is two-handed, so it takes both hands.`);
      }
      return (HANDS as readonly string[]).includes(target)
        ? [target]
        : block("wrong-slot", target, `${name} is one-handed: it goes in the Main hand or the Off hand.`);
    case "armor": {
      const fits = kindName(ref, entry.slotKind);
      if (target !== entry.slotKind) return block("wrong-slot", target, `${name} fits ${fits}, not ${where}.`);
      const kind = slotKinds(ref).find((k) => k.id === target);
      if (!kind || kind.retired) {
        return block("wrong-slot", target, `The ${fits} slot is no longer used, so ${name} can't be equipped there.`);
      }
      return [target];
    }
    case "items":
      if (entry.arcane) {
        return target === "arcane"
          ? ["arcane"]
          : block("wrong-slot", target, `${name} is arcane, so it goes in an arcane slot, not ${where}.`);
      }
      return target === "arcane"
        ? block("not-arcane", target, `${name} isn't arcane, so it can't go in an arcane slot.`)
        : block("cannot-equip", target, `${name} isn't arcane, so it can't be equipped.`);
    default:
      return block("cannot-equip", target, `${name} ${NOT_EQUIPPABLE[entry.category]}.`);
  }
}

const isShield = (e: Entry | undefined) => e?.category === "armor" && e.slotKind === "off-hand";

/** Whether `entryId` may be equipped in `target`: blocked, or allowed with any warnings (EQ-2 to EQ-8). */
export function checkEquip(sheet: CharacterSheet, ref: ReferenceData, entryId: Id, target: SlotTarget): EquipCheck {
  const entry = sheet.entries.find((e) => e.id === entryId);
  if (!entry) throw new NotFoundError("entry", entryId);
  const name = entryName(entry, ref);

  const slots = equippedSlots(sheet);
  const current = slots.get(entryId);
  if (current !== undefined) {
    const there = current === "arcane" ? "an arcane slot" : `the ${kindName(ref, current)}`;
    return block("already-equipped", current, `${name} is already equipped in ${there}. Unequip it first.`);
  }

  const needs = placement(entry, name, target, ref);
  if (!Array.isArray(needs)) return needs;

  const state = slotState(sheet, ref);
  if (needs[0] === "arcane") {
    const { used, allowed, occupants } = state.arcane;
    if (used > allowed) {
      return block("over-limit", "arcane", overLimitText("Arcane slots", used, allowed), occupants);
    }
    if (used >= allowed) {
      return block("arcane-full", "arcane", `Arcane slots are full: ${used} of ${allowed} used.`, occupants);
    }
    return { outcome: "allowed", warnings: [] };
  }

  if (isShield(entry)) {
    // EQ-3: until Q2 is answered, a character can't hold two shields.
    const entries = new Map(sheet.entries.map((e) => [e.id, e]));
    const shields = [...slots.keys()].filter((id) => isShield(entries.get(id)));
    if (shields.length > 0) {
      const held = shields.map((id) => ({ entryId: id, name: entryName(entries.get(id)!, ref) }));
      const names = listNames(held.map((o) => o.name));
      return block(
        "two-shields",
        "off-hand",
        `${names} is already held, and a character can't hold two shields.`,
        held,
      );
    }
  }

  const kinds = needs.map((id) => state.kinds.find((k) => k.kind === id)!);
  const over = kinds.find((k) => k.equipped > k.allowed);
  if (over) {
    return block("over-limit", over.kind, overLimitText(over.name, over.equipped, over.allowed), occupantsOf(over));
  }
  const full = kinds.filter((k) => k.equipped >= k.allowed);
  if (full.length > 0) {
    const inThem = [...new Map(full.flatMap(occupantsOf).map((o) => [o.entryId, o])).values()];
    const names = listNames(inThem.map((o) => o.name));
    const verb = inThem.length === 1 ? "is" : "are";
    if (needs.length > 1) {
      const hands = listNames(full.map((k) => `the ${k.name}`));
      return block(
        "hands-not-free",
        full[0]!.kind,
        `${name} needs both hands free: ${names} ${verb} in ${hands}.`,
        inThem,
      );
    }
    return block("slot-full", full[0]!.kind, `${full[0]!.name} is full: ${names} ${verb} in it.`, inThem);
  }
  return { outcome: "allowed", warnings: [] };
}

function occupantsOf(kind: SlotKindState): Occupant[] {
  return kind.slots.flatMap((s) => (s.occupant ? [s.occupant] : []));
}

function overLimitText(name: string, equipped: number, allowed: number): string {
  return `${name}: ${equipped} equipped, ${allowed} allowed. Nothing more can go there until you unequip ${equipped - allowed}.`;
}

// ---------------------------------------------------------------- over-limit alerts (EQ-8)

/** What each source adds to a slot kind's allowance, or the arcane slots' (the level chart included). */
function allowanceBySource(sheet: CharacterSheet, ref: ReferenceData, scope: Id | "arcane") {
  const by = new Map<string, { source: SourceRef; amount: number }>();
  const add = (source: SourceRef, amount: number) => {
    const key = sourceKey(source);
    by.set(key, { source, amount: (by.get(key)?.amount ?? 0) + amount });
  };
  if (scope === "arcane") {
    const { starting, fromLevels } = chartArcaneSlots(sheet, ref);
    add({ type: "level-chart" }, starting + fromLevels);
  }
  for (const { g, amount } of slotGrants(countedGrants(sheet, ref), scope)) add(g.source, amount);
  return by;
}

/** The source whose allowance the change took away, if any. */
function lostSource(change: SheetChange, after: CharacterSheet, ref: ReferenceData, scope: Id | "arcane") {
  const now = allowanceBySource(after, ref, scope);
  for (const [key, was] of allowanceBySource(change.before, ref, scope)) {
    const lost = was.amount - (now.get(key)?.amount ?? 0);
    if (lost > 0) return { source: was.source, amount: lost };
  }
  return undefined;
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
  const slots = `${arcane ? "arcane " : ""}slot${amount === 1 ? "" : "s"}`;
  if (source.type === "level-chart") {
    const what = reason === "class-corrected" ? "class was corrected" : "level was lowered";
    return ` The ${what}, so the level chart gives fewer arcane slots.`;
  }
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
  const state = slotState(sheet, ref);
  const over: {
    scope: OverLimitAlert["scope"];
    key: Id | "arcane";
    name: string;
    equipped: number;
    allowed: number;
  }[] = [
    ...state.kinds
      .filter((k) => k.equipped > k.allowed)
      .map((k) => ({
        scope: { type: "slot-kind" as const, id: k.kind },
        key: k.kind,
        name: k.name,
        equipped: k.equipped,
        allowed: k.allowed,
      })),
    ...(state.arcane.used > state.arcane.allowed
      ? [
          {
            scope: { type: "arcane" as const },
            key: "arcane",
            name: "Arcane slots",
            equipped: state.arcane.used,
            allowed: state.arcane.allowed,
          },
        ]
      : []),
  ];
  return over.map(({ scope, key, name, equipped, allowed }) => {
    const lost = change && lostSource(change, sheet, ref, key);
    let message = `${name}: ${equipped} equipped, ${allowed} allowed.`;
    if (lost && change) message += cause(lost.source, lost.amount, change.reason, key === "arcane");
    return {
      scope,
      equipped,
      allowed,
      ...(lost && change ? { lost: { source: lost.source, reason: change.reason } } : {}),
      message,
    };
  });
}
