// Skills in the rules core (section 6): the picker's two lists (SK-1, SK-1a)
// and the warnings when adding a skill (SK-3). Pure functions.

import { NotFoundError } from "../errors";
import type {
  CharacterSheet,
  ClassName,
  Id,
  MissingSkillLevel,
  Prerequisite,
  ReferenceData,
  Skill,
  SkillOption,
  SkillPicker,
  SkillPlacement,
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

/** A skill's place in each of its trees (RD-1): its `trees`, or its one `tree`. */
export function placements(skill: Skill): SkillPlacement[] {
  if (skill.trees) return skill.trees;
  if (skill.tree === undefined) return [];
  const one: SkillPlacement = { tree: skill.tree };
  if (skill.starting !== undefined) one.starting = skill.starting;
  if (skill.prerequisites !== undefined) one.prerequisites = skill.prerequisites;
  return [one];
}

function treeOf(c: Context, placement: SkillPlacement): SkillTree {
  const tree = c.trees.get(placement.tree);
  if (!tree) throw new NotFoundError("skill tree", placement.tree);
  return tree;
}

/**
 * The placements that count, in the order SK-3 prefers them: those in trees
 * open to the character's class first, then the skill list's order. A retired
 * tree's placement counts only if every tree is retired (RD-3).
 */
function ranked(c: Context, skill: Skill): { placement: SkillPlacement; tree: SkillTree; own: boolean }[] {
  const all = placements(skill).map((placement) => {
    const tree = treeOf(c, placement);
    return { placement, tree, own: tree.classes.includes(c.sheet.character.className) };
  });
  const live = all.filter((p) => !p.tree.retired);
  const list = live.length > 0 ? live : all;
  return [...list.filter((p) => p.own), ...list.filter((p) => !p.own)];
}

/** RD-3: a skill that's retired, or whose trees all are, isn't newly offered or added. */
function retiredSkill(skill: Skill, tree: (id: Id) => SkillTree | undefined): boolean {
  return skill.retired === true || placements(skill).every((p) => tree(p.tree)?.retired);
}

function warningsFor(c: Context, skill: Skill, placement: SkillPlacement, tree: SkillTree): SkillWarning[] {
  const { character } = c.sheet;
  const warnings: SkillWarning[] = [];
  const missing = placement.prerequisites && unmet(placement.prerequisites, (id) => (c.taken.get(id) ?? 0) > 0);
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

interface Judged {
  /** The tree the answer comes from: the one that allows it, or the one with the fewest warnings. */
  tree: Id;
  available: boolean;
  warnings: SkillWarning[];
}

/**
 * SK-1a, SK-3: a skill is available if any of its trees allows it (one the
 * class and level allow, prerequisites met, not taken as often as allowed, or
 * a starting skill of the character's own tree). Its warnings are the tree's
 * with the fewest, ties going to the first in `ranked` order. The tree named is
 * one with no warnings if there is one, so it matches the warnings.
 */
function judge(c: Context, skill: Skill, trees = ranked(c, skill)): Judged {
  const notTaken = (c.taken.get(skill.id) ?? 0) === 0;
  let starts: Id | undefined;
  let fewest: { tree: Id; warnings: SkillWarning[] } | undefined;
  for (const { placement, tree, own } of trees) {
    const warnings = warningsFor(c, skill, placement, tree);
    if (starts === undefined && placement.starting && own && notTaken) starts = tree.id;
    if (!fewest || warnings.length < fewest.warnings.length) fewest = { tree: tree.id, warnings };
  }
  // Only bad data has a skill in no tree (the schema refuses it).
  if (!fewest) throw new NotFoundError("skill tree", `for ${skill.id}`);
  const clean = fewest.warnings.length === 0 ? fewest.tree : undefined;
  const allows = clean ?? starts;
  return { tree: allows ?? fewest.tree, available: allows !== undefined, warnings: fewest.warnings };
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
    .filter((s) => s.name.toLowerCase().includes(query) && !retiredSkill(s, (id) => c.trees.get(id)))
    .map((skill) => ({ skill, trees: ranked(c, skill) }))
    .filter(({ trees }) => trees.some((p) => options.allTrees || p.own))
    .sort((a, b) => a.skill.name.localeCompare(b.skill.name));
  for (const { skill, trees } of offered) {
    const judged = judge(c, skill, trees);
    const option: SkillOption = {
      skillId: skill.id,
      name: skill.name,
      tree: judged.tree,
      taken: c.taken.get(skill.id) ?? 0,
    };
    (judged.available ? picker.available : picker.others).push(option);
  }
  return picker;
}

/** RD-3: a skill that's retired, or whose trees all are, can't be newly added. */
export function skillRetired(skill: Skill, ref: ReferenceData): boolean {
  return retiredSkill(skill, (id) => ref.trees.find((t) => t.id === id));
}

/** SK-6: levels up to the character's where the class's chart gives a skill but none has that Level gained. */
export function recordCheck(sheet: CharacterSheet, ref: ReferenceData): MissingSkillLevel[] {
  const { className, level } = sheet.character;
  const recorded = new Set(sheet.entries.flatMap((e) => (e.category === "skills" ? [e.levelGained] : [])));
  // The chart has each level once (checked when the reference data loads).
  return ref.levelChart[className].levels
    .filter((row) => row.skillGained && row.level <= level && !recorded.has(row.level))
    .map((row) => row.level)
    .sort((a, b) => a - b)
    .map((n) => ({ level: n, message: `Level ${n}: no skill recorded` }));
}

/** The warnings for adding `skillId` to the character (SK-3). Empty when nothing is wrong. */
export function skillWarnings(sheet: CharacterSheet, ref: ReferenceData, skillId: Id): SkillWarning[] {
  const skill = ref.skills.find((s) => s.id === skillId);
  if (!skill) throw new NotFoundError("skill", skillId);
  return judge(context(sheet, ref), skill).warnings;
}
