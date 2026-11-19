// What the browser tests need from the real reference data in data/, which the
// build uses (TF-13): read here with plain rules rather than the app's, so a
// test never names a real skill or number. Each reader fails, saying what it
// needs, when data/ no longer has it (TF-3).

import { readFileSync } from "node:fs";
import { parse } from "yaml";

type ClassName = "Warrior" | "Mage" | "Rogue";

export interface ChartRow {
  level: number;
  classBonus: number;
  classBonusDice?: string;
  dice: string;
  hearts: number;
  skillGained: boolean;
  arcaneSlot: boolean;
}

type Chart = Record<ClassName, { startingArcaneSlots: number; levels: ChartRow[] }>;

const read = (file: string): unknown => parse(readFileSync(new URL(`../../data/${file}`, import.meta.url), "utf8"));

const chart = (): Chart => read("level-chart.yaml") as Chart;

/** The level chart's row for a class and level. */
export function chartRow(className: ClassName, level: number): ChartRow {
  const row = chart()[className].levels.find((r) => r.level === level);
  if (!row) throw new Error(`data/level-chart.yaml needs a ${className} row for level ${level}, for this test`);
  return row;
}

/** The lowest level whose class bonus has dice (a Rogue's Stealth Bonus, GR-7). */
export function firstLevelWithBonusDice(className: ClassName): ChartRow {
  const row = chart()[className].levels.find((r) => r.classBonusDice !== undefined);
  if (!row)
    throw new Error(`data/level-chart.yaml needs a ${className} level whose class bonus has dice, for this test`);
  return row;
}

/** How many arcane slots the chart gives a class at a level: the start, plus each level's (EQ-6). */
export function arcaneSlots(className: ClassName, level: number): number {
  const { startingArcaneSlots, levels } = chart()[className];
  return startingArcaneSlots + levels.filter((r) => r.arcaneSlot && r.level <= level).length;
}

/** The levels up to `level` where the chart gives the class a skill or spell (SK-6), lowest first. */
export function skillLevels(className: ClassName, level: number): number[] {
  const { levels } = chart()[className];
  return levels
    .filter((r) => r.skillGained && r.level <= level)
    .map((r) => r.level)
    .sort((a, b) => a - b);
}

interface ListedTree {
  id: string;
  name: string;
  retired?: boolean;
}

interface ListedSkill {
  id: string;
  name: string;
  trees?: { tree: string }[];
  retired?: boolean;
}

/**
 * A skill printed in several trees (RD-1), none of them retired, whose name is in no other
 * skill's name, so searching for it finds only it; with its trees' names in the list's order.
 */
export function skillInSeveralTrees(): { name: string; trees: string[] } {
  const list = read("skills.yaml") as { trees: ListedTree[]; skills: ListedSkill[] };
  const tree = (id: string) => list.trees.find((t) => t.id === id);
  const skill = list.skills.find(
    (s) =>
      !s.retired &&
      (s.trees?.length ?? 0) >= 2 &&
      s.trees!.every((p) => tree(p.tree) && !tree(p.tree)!.retired) &&
      list.skills.filter((o) => o.name.toLowerCase().includes(s.name.toLowerCase())).length === 1,
  );
  if (!skill) {
    throw new Error(
      "data/skills.yaml needs a skill in several trees, none retired, whose name is in no other skill's name, " +
        "for this test",
    );
  }
  return { name: skill.name, trees: skill.trees!.map((p) => tree(p.tree)!.name) };
}
