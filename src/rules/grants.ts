// Which grants count for a character right now (GR-2, GR-3), each with its
// source and breakdown group. Totals, slots and alerts are all built on this,
// so they always agree (GR-5). Pure functions.

import type {
  BreakdownGroup,
  CharacterSheet,
  Entry,
  Grant,
  GrantLine,
  Id,
  ReferenceData,
  SlotTarget,
  SourceRef,
  TitleScope,
} from "./types";

/** A grant that counts, with where it comes from. */
export interface SourcedGrant {
  grant: Grant;
  source: SourceRef;
  group: BreakdownGroup;
}

/** A grant's condition, trimmed; undefined when it has none or it's blank. */
function conditionOf(grant: Grant): string | undefined {
  return grant.condition?.trim() || undefined;
}

/** GR-4: a grant with a condition is situational, never added to a total. */
export function isSituational(grant: Grant): boolean {
  return conditionOf(grant) !== undefined;
}

/** `{ condition }` when the grant is situational, so lines and dice carry a condition only then. */
export function withCondition(grant: Grant): { condition?: string } {
  const condition = conditionOf(grant);
  return condition !== undefined ? { condition } : {};
}

/** GR-1's amounts are numbers; bad data with one that isn't (NaN, Infinity) is left out. */
function usable(grant: Grant): boolean {
  return !("amount" in grant) || Number.isFinite(grant.amount);
}

/** A counted grant as a line in a total (GR-12). */
export function grantLine(g: SourcedGrant, amount: number): GrantLine {
  return { source: g.source, group: g.group, grantId: g.grant.id, amount, ...withCondition(g.grant) };
}

/** An entry's name; a skill's comes from the skill list, or its ID if the list doesn't have it. */
export function entryName(entry: Entry, ref: ReferenceData): string {
  return entry.category === "skills"
    ? (ref.skills.find((s) => s.id === entry.skillId)?.name ?? entry.skillId)
    : entry.name;
}

/** TI-2, TI-5: a player-level title applies to every character, a character-level one to its own. */
export function titleApplies(scope: TitleScope, characterId: Id): boolean {
  return scope.level === "player" || scope.characterId === characterId;
}

/** A grant that adds slots, to a slot kind or the arcane slots: the only kind whose loss can raise an alert (EQ-8). */
export function addsSlots(grant: Grant): boolean {
  return grant.kind === "slots" || grant.kind === "arcane-slots";
}

/** Where each equipped entry is, by entry ID (the first place listed, EQ-4). */
export function equippedSlots(sheet: CharacterSheet): Map<Id, SlotTarget> {
  const slots = new Map<Id, SlotTarget>();
  for (const { entryId, slot } of sheet.equipped) if (!slots.has(entryId)) slots.set(entryId, slot);
  return slots;
}

/**
 * GR-3: the breakdown group of an entry whose grants count now, or undefined.
 * They count while it's equipped (weapons and armor in a slot, arcane items in
 * an arcane slot) or active (allies); consumables and components never.
 */
function countingGroup(entry: Entry, slot: SlotTarget | undefined): BreakdownGroup | undefined {
  switch (entry.category) {
    case "weapons":
    case "armor":
      return slot !== undefined && slot !== "arcane" ? entry.category : undefined;
    case "items":
      return entry.arcane && slot === "arcane" ? "items" : undefined;
    case "allies":
      return entry.active ? "ally" : undefined;
    default:
      return undefined;
  }
}

/** Every grant that counts for the character now (situational ones included), in sheet order. */
export function countedGrants(sheet: CharacterSheet, ref: ReferenceData): SourcedGrant[] {
  const slots = equippedSlots(sheet);
  const skillGrants = new Map(ref.skillGrants.map((s) => [s.skill, s.grants]));
  const counted: SourcedGrant[] = [];
  const add = (grants: Grant[] | undefined, source: SourceRef, group: BreakdownGroup) => {
    for (const grant of grants ?? []) if (usable(grant)) counted.push({ grant, source, group });
  };

  for (const entry of sheet.entries) {
    if (entry.category === "skills") {
      const source: SourceRef = { type: "skill", id: entry.id, name: entryName(entry, ref), skillId: entry.skillId };
      add(skillGrants.get(entry.skillId), source, "skills");
      continue;
    }
    const group = countingGroup(entry, slots.get(entry.id));
    if (group) add(entry.grants, { type: "entry", id: entry.id, name: entry.name, category: entry.category }, group);
  }
  for (const title of sheet.titles) {
    if (titleApplies(title.scope, sheet.character.id)) {
      add(title.grants, { type: "title", id: title.id, name: title.name }, "titles");
    }
  }
  for (const manual of sheet.manualGrants) {
    add(manual.grants, { type: "manual", id: manual.id, reason: manual.reason }, "other");
  }
  return counted;
}

/** A key that tells sources apart (a skill taken three times is three sources). */
export function sourceKey(source: SourceRef): string {
  return source.type === "level-chart" ? "level-chart" : `${source.type}:${source.id}`;
}
