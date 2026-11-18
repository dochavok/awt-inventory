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
  SkillGrant,
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
export function addsSlots(grant: SkillGrant): boolean {
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

/** How large a grouped grant is: its amount, or for a die its highest roll (GR-1). */
function size(grant: Grant): number {
  if (grant.kind === "die") {
    return grant.die.split("+").reduce((sum, part) => {
      const [count = 0, sides = 0] = part.trim().split("d").map(Number);
      return sum + count * sides;
    }, 0);
  }
  return "amount" in grant ? grant.amount : 0;
}

type Collected = Omit<SourcedGrant, "grant"> & { grant: SkillGrant };

/**
 * GR-1's groups: within a group (of one kind) only the largest grant is kept,
 * whatever order the sheet lists them in. A grouped die that a `die-always`
 * grant names loses its condition, so it counts (GR-4's exception), and the
 * `die-always` grants themselves go.
 */
function resolveGroups(collected: Collected[]): SourcedGrant[] {
  const always = new Set<Id>();
  const largest = new Map<string, Collected>();
  const keyOf = (c: Collected) => `${c.grant.kind} ${c.grant.group}`;
  const beats = (a: Collected, b: Collected) => {
    const [sa, sb] = [size(a.grant as Grant), size(b.grant as Grant)];
    if (sa !== sb) return sa > sb;
    if (a.grant.id !== b.grant.id) return a.grant.id < b.grant.id;
    return sourceKey(a.source) < sourceKey(b.source);
  };
  for (const c of collected) {
    if (c.grant.kind === "die-always") always.add(c.grant.group);
    else if (c.grant.group !== undefined) {
      const best = largest.get(keyOf(c));
      if (!best || beats(c, best)) largest.set(keyOf(c), c);
    }
  }
  const out: SourcedGrant[] = [];
  for (const c of collected) {
    const { grant } = c;
    if (grant.kind === "die-always") continue;
    if (grant.group !== undefined && largest.get(keyOf(c)) !== c) continue;
    if (grant.kind === "die" && grant.group !== undefined && always.has(grant.group)) {
      const { condition: _situational, ...counts } = grant;
      out.push({ ...c, grant: counts });
    } else out.push({ ...c, grant });
  }
  return out;
}

/** A player's own grant without a skill list's group, or nothing for a die-always. */
function plainGrant(grant: Grant): Grant[] {
  if ((grant.kind as string) === "die-always") return [];
  const { group: _skillListOnly, ...plain } = grant as Grant & { group?: Id };
  return [plain as Grant];
}

/** Every grant that counts for the character now (situational ones included), in sheet order. */
export function countedGrants(sheet: CharacterSheet, ref: ReferenceData): SourcedGrant[] {
  const slots = equippedSlots(sheet);
  const skillGrants = new Map(ref.skillGrants.map((s) => [s.skill, s.grants]));
  const counted: Collected[] = [];
  const add = (grants: readonly SkillGrant[] | undefined, source: SourceRef, group: BreakdownGroup) => {
    for (const grant of grants ?? []) {
      if (grant.kind === "die-always" || usable(grant)) counted.push({ grant, source, group });
    }
  };
  // GR-1: groups and die-always come only from the skill list. On a player's own grants
  // (bad data the app's checks would refuse) they're ignored.
  const addOwn = (grants: readonly Grant[] | undefined, source: SourceRef, group: BreakdownGroup) =>
    add(grants?.flatMap(plainGrant), source, group);

  for (const entry of sheet.entries) {
    if (entry.category === "skills") {
      const source: SourceRef = { type: "skill", id: entry.id, name: entryName(entry, ref), skillId: entry.skillId };
      add(skillGrants.get(entry.skillId), source, "skills");
      continue;
    }
    const group = countingGroup(entry, slots.get(entry.id));
    if (group) addOwn(entry.grants, { type: "entry", id: entry.id, name: entry.name, category: entry.category }, group);
  }
  for (const title of sheet.titles) {
    if (titleApplies(title.scope, sheet.character.id)) {
      addOwn(title.grants, { type: "title", id: title.id, name: title.name }, "titles");
    }
  }
  for (const manual of sheet.manualGrants) {
    addOwn(manual.grants, { type: "manual", id: manual.id, reason: manual.reason }, "other");
  }
  return resolveGroups(counted);
}

/** A key that tells sources apart (a skill taken three times is three sources). */
export function sourceKey(source: SourceRef): string {
  return source.type === "level-chart" ? "level-chart" : `${source.type}:${source.id}`;
}
