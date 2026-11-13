// The user guide's examples (DOC-4, EX-5): made by the app's own code from the
// made-up sample account in docs/sample/, never typed by hand. Each example
// sits in a guide page between markers:
//
//   <!-- generated: NAME -->
//   ...
//   <!-- end generated: NAME -->
//
// scripts/generate-docs.ts writes them (--write) or checks they still match
// (--check); this file holds the work, so a new example doesn't change the
// protected script.

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { z } from "zod";
import { MemoryDatabase, createMemoryStore } from "../src/data/memory-store";
import type { InventoryStore } from "../src/data/store";
import type { GainOptions, NewEntry, NewSkill, NewTitle } from "../src/data/types";
import { loadReferenceData } from "../src/refdata";

/** docs/sample/sample.yaml: unknown fields are refused, so a typo can't vanish from the examples. */
const Sample = z.strictObject({
  at: z.iso.datetime(),
  displayName: z.string(),
  character: z.strictObject({
    name: z.string(),
    className: z.enum(["Warrior", "Mage", "Rogue"]),
    level: z.number().int(),
    notes: z.string().optional(),
  }),
  entries: z.array(
    z.strictObject({
      // The entry's own fields, checked by the store as the app checks them.
      entry: z.record(z.string(), z.unknown()),
      gain: z.strictObject({ source: z.string(), link: z.string(), note: z.string() }).partial().optional(),
      used: z.strictObject({ note: z.string() }).partial().optional(),
    }),
  ),
  skills: z.array(z.record(z.string(), z.unknown())),
  titles: z.array(z.record(z.string(), z.unknown())),
});

/** The sample account, built through the app's store with the reference data in data/. */
async function sampleStore(root: string): Promise<InventoryStore> {
  const sample = Sample.parse(parse(readFileSync(join(root, "docs", "sample", "sample.yaml"), "utf8")));
  const dataDir = join(root, "data");
  const ref = loadReferenceData(
    Object.fromEntries(
      readdirSync(dataDir)
        .filter((f) => f.endsWith(".yaml"))
        .map((f) => [f, readFileSync(join(dataDir, f), "utf8")]),
    ),
  );
  const store = createMemoryStore(new MemoryDatabase(), {
    currentUid: () => "sample-user",
    clock: { now: () => new Date(sample.at) },
    ref,
    settings: { showSkillText: false, appVersion: "sample" },
  });
  await store.createProfile({ displayName: sample.displayName, email: "sample@example.com" });
  const character = await store.createCharacter(sample.character);
  for (const { entry, gain, used } of sample.entries) {
    const added = await store.addEntry(character.id, entry as unknown as NewEntry, gain as GainOptions | undefined);
    if (used) await store.markUsed(added.id, used);
  }
  for (const skill of sample.skills) await store.addSkill(character.id, skill as unknown as NewSkill);
  for (const title of sample.titles) await store.addTitle(title as unknown as NewTitle);
  return store;
}

/** Each example by name: the Markdown that goes between its markers. */
async function examples(root: string): Promise<Record<string, string>> {
  const store = await sampleStore(root);
  return {
    // EX-5: the whole JSON export of the sample account.
    "json-example": ["```json", JSON.stringify(await store.exportJson(), null, 2), "```"].join("\n"),
  };
}

const MARKED = /(<!-- generated: ([\w-]+) -->\n)[\s\S]*?(<!-- end generated: \2 -->)/g;

export interface DocsCheck {
  /** Pages whose text differs from what the examples make, with the new text. */
  changed: { file: string; text: string }[];
  /** Markers naming an example that doesn't exist. */
  problems: string[];
}

/** Every guide page with its examples made afresh, and which of them differ from what's committed. */
export async function checkDocs(root: string): Promise<DocsCheck> {
  const made = await examples(root);
  const used = new Set<string>();
  const result: DocsCheck = { changed: [], problems: [] };
  const docs = join(root, "docs");
  for (const file of readdirSync(docs).filter((f) => f.endsWith(".md"))) {
    const before = readFileSync(join(docs, file), "utf8").replaceAll("\r\n", "\n");
    const after = before.replace(MARKED, (whole, start: string, name: string, end: string) => {
      used.add(name);
      if (made[name] === undefined) {
        result.problems.push(`docs/${file}: no example called "${name}"`);
        return whole;
      }
      return `${start}${made[name]}\n${end}`;
    });
    if (after !== before) result.changed.push({ file: `docs/${file}`, text: after });
  }
  for (const name of Object.keys(made)) {
    if (!used.has(name)) result.problems.push(`no guide page has the "${name}" example`);
  }
  return result;
}
