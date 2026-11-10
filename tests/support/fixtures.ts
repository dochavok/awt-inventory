// Loads the YAML fixtures (TF-3): the test copy of the reference data, and the
// made-up users and characters. Read-only; every call returns a fresh copy.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import type {
  CharacterSheet,
  ClassChart,
  ClassName,
  Entry,
  Equipped,
  ManualGrant,
  ReferenceData,
  Title,
} from "../../src/rules/types";

const FIXTURES = new URL("../fixtures/", import.meta.url);

export function readYaml<T>(relativePath: string): T {
  const path = fileURLToPath(new URL(relativePath, FIXTURES));
  return parse(readFileSync(path, "utf8")) as T;
}

export function testReferenceData(): ReferenceData {
  const skills = readYaml<Pick<ReferenceData, "trees" | "skills">>("refdata/skills.yaml");
  const suggestions =
    readYaml<Pick<ReferenceData, "itemFamilies" | "componentTiers" | "acquisitionSources">>("refdata/suggestions.yaml");
  return {
    levelChart: readYaml<Record<ClassName, ClassChart>>("refdata/level-chart.yaml"),
    slotKinds: readYaml("refdata/slot-kinds.yaml"),
    rarities: readYaml("refdata/rarities.yaml"),
    itemFamilies: suggestions.itemFamilies,
    componentTiers: suggestions.componentTiers,
    acquisitionSources: suggestions.acquisitionSources,
    trees: skills.trees,
    skills: skills.skills,
    skillGrants: readYaml("refdata/skill-grants.yaml"),
  };
}

export interface FixtureUser {
  uid: string;
  email: string;
  displayName: string;
}

export function testUsers(): Record<string, FixtureUser> {
  return readYaml("users.yaml");
}

/** A character as written in YAML: IDs, but no characterId or default quantity on entries. */
export interface CharacterInput {
  owner?: string;
  character: Omit<CharacterSheet["character"], "id"> & { id?: string };
  entries?: Record<string, unknown>[];
  equipped?: Equipped[];
  titles?: Title[];
  manualGrants?: ManualGrant[];
}

export function toSheet(id: string, input: CharacterInput): CharacterSheet {
  return {
    character: { ...input.character, id },
    entries: (input.entries ?? []).map((e) => ({ quantity: 1, ...e, characterId: id }) as unknown as Entry),
    equipped: [...(input.equipped ?? [])],
    titles: [...(input.titles ?? [])],
    manualGrants: [...(input.manualGrants ?? [])],
  };
}

export function fixtureCharacters(): Record<string, CharacterInput> {
  return readYaml("characters.yaml");
}

/** A fixture character's sheet, by its ID (e.g. "aldric"). */
export function fixtureSheet(id: string): CharacterSheet {
  const input = fixtureCharacters()[id];
  if (!input) throw new Error(`No fixture character "${id}" in tests/fixtures/characters.yaml`);
  return toSheet(id, input);
}
