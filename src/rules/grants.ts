// Which grants count for a character right now (GR-2, GR-3), each with its
// source and breakdown group. Totals, slots and alerts are all built on this,
// so they always agree (GR-5). Pure functions.

import type { BreakdownGroup, CharacterSheet, Entry, Grant, Id, ReferenceData, SlotTarget, SourceRef } from "./types";

/** A grant that counts, with where it comes from. */
export interface SourcedGrant {
  grant: Grant;
  source: SourceRef;
  group: BreakdownGroup;
}

/** GR-4: a grant with a condition is situational, never added to a total. */
export function isSituational(grant: Grant): boolean {
  return Boolean(grant.condition?.trim());
}

/** Where each equipped entry is, by entry ID (the first place listed, EQ-4). */
export function equippedSlots(sheet: CharacterSheet): Map<Id, SlotTarget> {
  const slots = new Map<Id, SlotTarget>();
  for (const { entryId, slot } of sheet.equipped) if (!slots.has(entryId)) slots.set(entryId, slot);
  return slots;
}

/** GR-3: an entry's grants count while it's equipped (weapons and armor in a slot, arcane items in an arcane slot) or active (allies). */
function entryCounts(entry: Entry, slot: SlotTarget | undefined): boolean {
  switch (entry.category) {
    case "weapons":
    case "armor":
      return slot !== undefined && slot !== "arcane";
    case "items":
      return entry.arcane && slot === "arcane";
    case "allies":
      return entry.active;
    default:
      return false;
  }
}

const ENTRY_GROUP = { weapons: "weapons", armor: "armor", items: "items", allies: "ally" } as const;

/** Every grant that counts for the character now (situational ones included), in sheet order. */
export function countedGrants(sheet: CharacterSheet, ref: ReferenceData): SourcedGrant[] {
  const slots = equippedSlots(sheet);
  const skillGrants = new Map(ref.skillGrants.map((s) => [s.skill, s.grants]));
  const skillNames = new Map(ref.skills.map((s) => [s.id, s.name]));
  const counted: SourcedGrant[] = [];
  const add = (grants: Grant[] | undefined, source: SourceRef, group: BreakdownGroup) => {
    for (const grant of grants ?? []) counted.push({ grant, source, group });
  };

  for (const entry of sheet.entries) {
    if (entry.category === "skills") {
      const name = skillNames.get(entry.skillId) ?? entry.skillId;
      add(skillGrants.get(entry.skillId), { type: "skill", id: entry.id, name, skillId: entry.skillId }, "skills");
    } else if (entryCounts(entry, slots.get(entry.id))) {
      const group = ENTRY_GROUP[entry.category as keyof typeof ENTRY_GROUP];
      add(entry.grants, { type: "entry", id: entry.id, name: entry.name, category: entry.category }, group);
    }
  }
  for (const title of sheet.titles) {
    const applies = title.scope.level === "player" || title.scope.characterId === sheet.character.id;
    if (applies) add(title.grants, { type: "title", id: title.id, name: title.name }, "titles");
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
