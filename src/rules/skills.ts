// Skills in the rules core (section 6): the picker's two lists (SK-1, SK-1a)
// and the warnings when adding a skill (SK-3). Pure functions.

import { NotFoundError } from "../errors";
import type {
  CharacterSheet,
  ClassName,
  Id,
  Prerequisite,
  ReferenceData,
  Skill,
  SkillOption,
  SkillPicker,
  SkillTree,
  SkillWarning,
} from "./types";

const PLURAL: Record<ClassName, string> = { Warrior: "Warriors", Mage: "Mages", Rogue: "Rogues" };

/** How many times the character has each skill, by skill ID. */
function takenCounts(sheet: CharacterSheet): Map<Id, number> {
  const counts = new Map<Id, number>();
  for (const entry of sheet.entries) {
    if (entry.category === "skills") counts.set(entry.skillId, (counts.get(entry.skillId) ?? 0) + 1);
  }
  return counts;
}

/** The part of a prerequisite the character hasn't met, or null if it's met. */
function unmet(p: Prerequisite, has: (id: Id) => boolean): Prerequisite | null {
  if ("skill" in p) return has(p.skill) ? null : p;
  if ("any" in p) return p.any.some((q) => unmet(q, has) === null) ? null : p;
  const missing = p.all.map((q) => unmet(q, has)).filter((q): q is Prerequisite => q !== null);
  if (missing.length === 0) return null;
  return missing.length === 1 ? missing[0]! : { all: missing };
}

/** Every skill a prerequisite names. */
export function prerequisiteSkillIds(p: Prerequisite): Id[] {
  if ("skill" in p) return [p.skill];
  return ("all" in p ? p.all : p.any).flatMap(prerequisiteSkillIds);
}

/** e.g. "Stoneskin, and Thick Hide or Broad Shoulders". */
function describe(p: Prerequisite, name: (id: Id) => string): string {
  if ("skill" in p) return name(p.skill);
  if ("any" in p) return p.any.map((q) => describe(q, name)).join(" or ");
  const parts = p.all.map((q) => describe(q, name));
  return parts.join(p.all.some((q) => !("skill" in q)) ? ", and " : " and ");
}

interface Context {
  ref: ReferenceData;
  sheet: CharacterSheet;
  taken: Map<Id, number>;
  trees: Map<Id, SkillTree>;
  skills: Map<Id, Skill>;
}

function context(sheet: CharacterSheet, ref: ReferenceData): Context {
  return {
    ref,
    sheet,
    taken: takenCounts(sheet),
    trees: new Map(ref.trees.map((t) => [t.id, t])),
    skills: new Map(ref.skills.map((s) => [s.id, s])),
  };
}

function treeOf(c: Context, skill: Skill): SkillTree {
  const tree = c.trees.get(skill.tree);
  if (!tree) throw new NotFoundError("skill tree", skill.tree);
  return tree;
}

function warningsFor(c: Context, skill: Skill): SkillWarning[] {
  const { character } = c.sheet;
  const tree = treeOf(c, skill);
  const warnings: SkillWarning[] = [];
  const missing = skill.prerequisites && unmet(skill.prerequisites, (id) => (c.taken.get(id) ?? 0) > 0);
  if (missing) {
    warnings.push({
      reason: "missing-prerequisite",
      skillIds: prerequisiteSkillIds(missing),
      message: `${skill.name} needs ${describe(missing, (id) => c.skills.get(id)?.name ?? id)}.`,
    });
  }
  if (!tree.classes.includes(character.className)) {
    warnings.push({
      reason: "other-class",
      skillIds: [skill.id],
      message: `${skill.name} is from the ${tree.name} tree, which isn't open to ${PLURAL[character.className]}.`,
    });
  }
  if (tree.entryLevel !== undefined && character.level < tree.entryLevel) {
    warnings.push({
      reason: "below-entry-level",
      skillIds: [skill.id],
      message: `The ${tree.name} tree starts at level ${tree.entryLevel}; ${character.name} is level ${character.level}.`,
    });
  }
  const max = skill.maxTimes ?? 1;
  const taken = c.taken.get(skill.id) ?? 0;
  if (taken >= max) {
    warnings.push({
      reason: "already-taken",
      skillIds: [skill.id],
      message:
        max === 1
          ? `${character.name} already has ${skill.name}, which can be taken only once.`
          : `${character.name} already has ${skill.name} ${taken} times, its limit.`,
    });
  }
  return warnings;
}

/** SK-1a: in a tree the class and level allow, prerequisites met, not taken as often as allowed. */
function isAvailable(c: Context, skill: Skill): boolean {
  const tree = treeOf(c, skill);
  const ownTree = tree.classes.includes(c.sheet.character.className);
  if (skill.starting && ownTree && (c.taken.get(skill.id) ?? 0) === 0) return true;
  return warningsFor(c, skill).length === 0;
}

/** The skill picker's two lists (SK-1, SK-1a). `query` searches by name, ignoring case. */
export function skillPicker(
  sheet: CharacterSheet,
  ref: ReferenceData,
  options: { allTrees: boolean; query?: string },
): SkillPicker {
  const c = context(sheet, ref);
  const query = options.query?.trim().toLowerCase() ?? "";
  const picker: SkillPicker = { available: [], others: [] };
  const offered = ref.skills
    .filter((s) => !s.retired && !treeOf(c, s).retired)
    .filter((s) => options.allTrees || treeOf(c, s).classes.includes(sheet.character.className))
    .filter((s) => s.name.toLowerCase().includes(query))
    .sort((a, b) => a.name.localeCompare(b.name));
  for (const skill of offered) {
    const option: SkillOption = {
      skillId: skill.id,
      name: skill.name,
      tree: skill.tree,
      taken: c.taken.get(skill.id) ?? 0,
    };
    (isAvailable(c, skill) ? picker.available : picker.others).push(option);
  }
  return picker;
}

/** The warnings for adding `skillId` to the character (SK-3). Empty when nothing is wrong. */
export function skillWarnings(sheet: CharacterSheet, ref: ReferenceData, skillId: Id): SkillWarning[] {
  const skill = ref.skills.find((s) => s.id === skillId);
  if (!skill) throw new NotFoundError("skill", skillId);
  return warningsFor(context(sheet, ref), skill);
}
