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
const parsed = new Map<string, unknown>();

/** A fixture file, parsed once per test process; each call returns a fresh copy tests may change. */
export function readYaml<T>(relativePath: string): T {
  if (!parsed.has(relativePath)) {
    parsed.set(relativePath, parse(readFileSync(fileURLToPath(new URL(relativePath, FIXTURES)), "utf8")));
  }
  return structuredClone(parsed.get(relativePath)) as T;
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

/** A fixture user by name (e.g. "bram"). */
export function fixtureUser(name: string): FixtureUser {
  const user = testUsers()[name];
  if (!user) throw new Error(`No fixture user "${name}" in tests/fixtures/users.yaml`);
  return user;
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

/** An entry as written in YAML, with its character and the default quantity of 1. */
export function toEntry(characterId: string, raw: Record<string, unknown>): Entry {
  return { quantity: 1, ...raw, characterId } as unknown as Entry;
}

export function toSheet(id: string, input: CharacterInput): CharacterSheet {
  return {
    character: { ...input.character, id },
    entries: (input.entries ?? []).map((e) => toEntry(id, e)),
    equipped: [...(input.equipped ?? [])],
    titles: [...(input.titles ?? [])],
    manualGrants: [...(input.manualGrants ?? [])],
  };
}

export function fixtureCharacters(): Record<string, CharacterInput> {
  return readYaml("characters.yaml");
}

/** A fixture character as written in YAML, by its ID (e.g. "aldric"). */
export function fixtureCharacter(id: string): CharacterInput {
  const input = fixtureCharacters()[id];
  if (!input) throw new Error(`No fixture character "${id}" in tests/fixtures/characters.yaml`);
  return input;
}

/** A fixture character's sheet, by its ID. */
export function fixtureSheet(id: string): CharacterSheet {
  return toSheet(id, fixtureCharacter(id));
}
