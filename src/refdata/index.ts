// Reference data (section 13): reading and checking the YAML files in data/.
// validateReferenceData is what CI runs on every change (RD-4); the app loads
// the files with loadReferenceData, which refuses data with any problem.

import { parse } from "yaml";
import type { z } from "zod";
import { CLASS_NAMES, type Prerequisite, type ReferenceData } from "../rules/types";
import { FILES, type FileName, type Parsed } from "./schema";

/** The reference data files' text, by file name (e.g. "level-chart.yaml"). */
export type ReferenceFiles = Record<string, string>;

export interface DataProblem {
  file: string;
  /** The entry's ID, where the problem is about one. */
  id?: string;
  message: string;
}

const FILE_NAMES = Object.keys(FILES) as FileName[];

function problem(file: string, message: string, id?: string): DataProblem {
  return id === undefined ? { file, message } : { file, id, message };
}

/** The ID of the list entry a zod issue path points into, if it has one. */
function entryId(raw: unknown, path: readonly PropertyKey[]): string | undefined {
  let node = raw;
  let found: string | undefined;
  for (const key of path) {
    if (node === null || typeof node !== "object") break;
    node = (node as Record<PropertyKey, unknown>)[key];
    if (typeof key === "number" && node !== null && typeof node === "object") {
      const { id, skill } = node as { id?: unknown; skill?: unknown };
      if (typeof id === "string") found = id;
      else if (typeof skill === "string") found = skill;
    }
  }
  return found;
}

/** Each file parsed and checked against its schema; the ones that pass, and the problems. */
function readFiles(files: ReferenceFiles): { parsed: Partial<Parsed>; problems: DataProblem[] } {
  const parsed: Partial<Record<FileName, unknown>> = {};
  const problems: DataProblem[] = [];
  for (const file of FILE_NAMES) {
    const text = files[file];
    if (text === undefined) {
      problems.push(problem(file, "the file is missing"));
      continue;
    }
    let raw: unknown;
    try {
      raw = parse(text);
    } catch (error) {
      problems.push(problem(file, `not valid YAML: ${(error as Error).message.split("\n")[0]}`));
      continue;
    }
    const result = (FILES[file] as z.ZodType).safeParse(raw);
    if (result.success) {
      parsed[file] = result.data;
      continue;
    }
    for (const issue of result.error.issues) {
      const where = issue.path.map(String).join(".");
      problems.push(problem(file, `${where ? `${where}: ` : ""}${issue.message}`, entryId(raw, issue.path)));
    }
  }
  return { parsed: parsed as Partial<Parsed>, problems };
}

interface Named {
  id: string;
  name: string;
}

function duplicates(file: string, list: Named[]): DataProblem[] {
  const problems: DataProblem[] = [];
  const ids = new Set<string>();
  const names = new Set<string>();
  for (const entry of list) {
    if (ids.has(entry.id)) problems.push(problem(file, `duplicate ID ${entry.id}`, entry.id));
    if (names.has(entry.name.toLowerCase())) problems.push(problem(file, `duplicate name ${entry.name}`, entry.id));
    ids.add(entry.id);
    names.add(entry.name.toLowerCase());
  }
  return problems;
}

function prerequisiteSkills(p: Prerequisite): string[] {
  if ("skill" in p) return [p.skill];
  return ("all" in p ? p.all : p.any).flatMap(prerequisiteSkills);
}

function highestLevel(chart: Parsed["level-chart.yaml"]): number {
  return Math.max(...CLASS_NAMES.flatMap((c) => chart[c].levels.map((l) => l.level)));
}

function checkLevelChart(chart: Parsed["level-chart.yaml"]): DataProblem[] {
  const file = "level-chart.yaml";
  const problems: DataProblem[] = [];
  const cap = highestLevel(chart);
  for (const className of CLASS_NAMES) {
    const levels = chart[className].levels.map((l) => l.level);
    const seen = new Set<number>();
    for (const level of levels) {
      if (seen.has(level)) problems.push(problem(file, `${className} has level ${level} twice`));
      seen.add(level);
    }
    for (let level = 1; level <= cap; level++) {
      if (!seen.has(level)) problems.push(problem(file, `${className} is missing level ${level}`));
    }
  }
  return problems;
}

function checkReferences(p: Partial<Parsed>): DataProblem[] {
  const problems: DataProblem[] = [];
  const skillsFile = p["skills.yaml"];
  if (skillsFile) {
    const file = "skills.yaml";
    const trees = new Set(skillsFile.trees.map((t) => t.id));
    const skills = new Set(skillsFile.skills.map((s) => s.id));
    problems.push(...duplicates(file, skillsFile.trees), ...duplicates(file, skillsFile.skills));
    for (const skill of skillsFile.skills) {
      if (!trees.has(skill.tree)) problems.push(problem(file, `unknown tree ${skill.tree}`, skill.id));
      for (const needed of skill.prerequisites ? prerequisiteSkills(skill.prerequisites) : []) {
        if (!skills.has(needed)) problems.push(problem(file, `unknown prerequisite ${needed}`, skill.id));
      }
      for (const replacement of skill.replacedBy ?? []) {
        if (!skills.has(replacement))
          problems.push(problem(file, `replaced by unknown skill ${replacement}`, skill.id));
      }
    }
  }
  const slotKinds = p["slot-kinds.yaml"];
  const rarities = p["rarities.yaml"];
  if (slotKinds) problems.push(...duplicates("slot-kinds.yaml", slotKinds));
  if (rarities) problems.push(...duplicates("rarities.yaml", rarities));
  const suggestions = p["suggestions.yaml"];
  if (suggestions) {
    for (const list of [suggestions.itemFamilies, suggestions.componentTiers, suggestions.acquisitionSources]) {
      problems.push(...duplicates("suggestions.yaml", list));
    }
  }
  const skillGrants = p["skill-grants.yaml"];
  if (skillGrants) {
    const file = "skill-grants.yaml";
    const seen = new Set<string>();
    const grantIds = new Set<string>();
    for (const { skill, grants } of skillGrants) {
      if (seen.has(skill)) problems.push(problem(file, `grants for ${skill} are listed twice`, skill));
      seen.add(skill);
      if (skillsFile && !skillsFile.skills.some((s) => s.id === skill)) {
        problems.push(problem(file, `grants for unknown skill ${skill}`, skill));
      }
      for (const grant of grants) {
        if (grantIds.has(grant.id)) problems.push(problem(file, `duplicate grant ID ${grant.id}`, skill));
        grantIds.add(grant.id);
        if (grant.kind === "slots" && slotKinds && !slotKinds.some((k) => k.id === grant.slotKind)) {
          problems.push(problem(file, `grant ${grant.id} is for unknown slot kind ${grant.slotKind}`, skill));
        }
        if (grant.kind === "allowance" && rarities && !rarities.some((r) => r.id === grant.rarity)) {
          problems.push(problem(file, `grant ${grant.id} is for unknown rarity ${grant.rarity}`, skill));
        }
      }
    }
  }
  const chart = p["level-chart.yaml"];
  if (chart) problems.push(...checkLevelChart(chart));
  return problems;
}

/** The lists whose entries, once released, must stay (retired if need be), by file. */
function releasedLists(p: Partial<Parsed>): [string, string, Named[]][] {
  const lists: [string, string, Named[]][] = [];
  if (p["slot-kinds.yaml"]) lists.push(["slot-kinds.yaml", "slot kind", p["slot-kinds.yaml"]]);
  if (p["rarities.yaml"]) lists.push(["rarities.yaml", "rarity", p["rarities.yaml"]]);
  const s = p["suggestions.yaml"];
  if (s) {
    lists.push(["suggestions.yaml", "item family", s.itemFamilies]);
    lists.push(["suggestions.yaml", "component tier", s.componentTiers]);
    lists.push(["suggestions.yaml", "acquisition source", s.acquisitionSources]);
  }
  const k = p["skills.yaml"];
  if (k) {
    lists.push(["skills.yaml", "skill tree", k.trees]);
    lists.push(["skills.yaml", "skill", k.skills]);
  }
  return lists;
}

/** RD-4 and RD-5: nothing released disappears, and the level cap never drops. */
function checkReleased(current: Partial<Parsed>, released: Partial<Parsed>): DataProblem[] {
  const problems: DataProblem[] = [];
  const now = new Map(releasedLists(current).map(([file, kind, list]) => [`${file} ${kind}`, list]));
  for (const [file, kind, list] of releasedLists(released)) {
    const currentList = now.get(`${file} ${kind}`);
    if (!currentList) continue; // the file has a format problem, reported already
    const ids = new Set(currentList.map((e) => e.id));
    for (const entry of list) {
      if (!ids.has(entry.id)) {
        problems.push(
          problem(file, `the ${kind} ${entry.id} was released, so retire it instead of removing it`, entry.id),
        );
      }
    }
  }
  const [before, after] = [released["level-chart.yaml"], current["level-chart.yaml"]];
  if (before && after && highestLevel(after) < highestLevel(before)) {
    problems.push(
      problem(
        "level-chart.yaml",
        `the level cap was ${highestLevel(before)} and can't be lowered to ${highestLevel(after)}`,
      ),
    );
  }
  return problems;
}

/**
 * RD-4: everything wrong with `files`: invalid format, broken references,
 * duplicate IDs or names, gaps in the level chart, and, given the `released`
 * files, any entry that disappeared instead of being retired.
 */
export function validateReferenceData(files: ReferenceFiles, released?: ReferenceFiles): DataProblem[] {
  const { parsed, problems } = readFiles(files);
  problems.push(...checkReferences(parsed));
  if (released) problems.push(...checkReleased(parsed, readFiles(released).parsed));
  return problems;
}

/** The files read, checked and turned into reference data. Throws if there are problems. */
export function loadReferenceData(files: ReferenceFiles): ReferenceData {
  const problems = validateReferenceData(files);
  if (problems.length > 0) {
    const list = problems.map((p) => `${p.file}${p.id ? ` ${p.id}` : ""}: ${p.message}`).join("\n");
    throw new Error(`The reference data has problems (RD-4):\n${list}`);
  }
  const p = readFiles(files).parsed as Parsed;
  const suggestions = p["suggestions.yaml"];
  return {
    levelChart: p["level-chart.yaml"],
    slotKinds: p["slot-kinds.yaml"],
    rarities: p["rarities.yaml"],
    itemFamilies: suggestions.itemFamilies,
    componentTiers: suggestions.componentTiers,
    acquisitionSources: suggestions.acquisitionSources,
    trees: p["skills.yaml"].trees,
    skills: p["skills.yaml"].skills,
    skillGrants: p["skill-grants.yaml"],
  } as ReferenceData;
}

/** RD-5: the level cap is the highest level in the chart. */
export function levelCap(ref: ReferenceData): number {
  return Math.max(...CLASS_NAMES.flatMap((c) => ref.levelChart[c].levels.map((l) => l.level)));
}
