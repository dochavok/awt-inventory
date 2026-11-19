// The user guide's examples (DOC-4, EX-5): made by the app's own code from the
// made-up sample account in docs/sample/, never typed by hand. Each example
// sits in a guide page between markers:
//
//   <!-- generated: NAME -->
//   ...
//   <!-- end generated: NAME -->
//
// This file makes the examples, so a new one doesn't change a protected script.
// scripts/generate-docs.ts (protected, TF-7) puts them between the markers
// (--write) or checks the committed ones still match (--check).

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { z } from "zod";
import { arcaneCount, slotLine, totalsView } from "../src/app/grant-text";
import { slotState } from "../src/rules/equipping";
import { recordCheck } from "../src/rules/skills";
import { SHOW_SKILL_TEXT } from "../src/app/settings";
import { MemoryDatabase, createMemoryStore } from "../src/data/memory-store";
import type { InventoryStore } from "../src/data/store";
import type { GainOptions, NewEntry, NewSkill, NewTitle } from "../src/data/types";
import { loadReferenceData } from "../src/refdata";
import type { CharacterSheet, NewGrant, ReferenceData } from "../src/rules/types";

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
      // The entry's own fields (grants included), checked by the store as the app checks them.
      entry: z.record(z.string(), z.unknown()),
      gain: z.strictObject({ source: z.string(), link: z.string(), note: z.string() }).partial().optional(),
      used: z.strictObject({ note: z.string() }).partial().optional(),
      /** Where it's equipped, once every entry is added, in the file's order (EQ-2 to EQ-7). */
      equip: z.string().optional(),
      /** Traded or given away once everything is equipped, in the file's order (IN-14). */
      trade: z.strictObject({ kind: z.enum(["traded", "given-away"]), note: z.string().optional() }).optional(),
    }),
  ),
  skills: z.array(z.record(z.string(), z.unknown())),
  titles: z.array(z.record(z.string(), z.unknown())),
  manualGrants: z.array(z.strictObject({ reason: z.string(), grants: z.array(z.record(z.string(), z.unknown())) })),
});

/** The sample account's store, its one character's ID, and its equipment before anything was traded. */
interface SampleAccount {
  store: InventoryStore;
  characterId: string;
  ref: ReferenceData;
  equipment: string;
}

/**
 * DOC-4: the paper doll's slots that hold something or come from a grant, and the arcane
 * slots' count, as the equipment page shows them (EQ-5, EQ-7).
 */
function equipmentExample(sheet: CharacterSheet, ref: ReferenceData): string {
  const state = slotState(sheet, ref);
  const slots = state.kinds.flatMap((k) => k.slots).filter((s) => s.occupant || s.source);
  return ["```text", ...slots.map(slotLine), arcaneCount(state.arcane), "```"].join("\n");
}

/** The sample account, built through the app's store with the reference data in data/. */
async function sampleAccount(root: string): Promise<SampleAccount> {
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
    // As the app runs. No example made today (the JSON export) holds card text.
    settings: { showSkillText: SHOW_SKILL_TEXT, appVersion: "sample" },
  });
  await store.createProfile({ displayName: sample.displayName, email: "sample@example.com" });
  const character = await store.createCharacter(sample.character);
  const added: { id: string; equip?: string; trade?: (typeof sample.entries)[number]["trade"] }[] = [];
  for (const { entry, gain, used, equip, trade } of sample.entries) {
    const { id } = await store.addEntry(character.id, entry as unknown as NewEntry, gain as GainOptions | undefined);
    added.push({ id, ...(equip === undefined ? {} : { equip }), ...(trade ? { trade } : {}) });
    if (used) await store.markUsed(id, used);
  }
  for (const skill of sample.skills) await store.addSkill(character.id, skill as unknown as NewSkill);
  for (const title of sample.titles) await store.addTitle(title as unknown as NewTitle);
  for (const { reason, grants } of sample.manualGrants) {
    await store.addManualGrant(character.id, reason, grants as unknown as NewGrant[]);
  }
  for (const { id, equip } of added) {
    if (equip === undefined) continue;
    const check = await store.equip(id, equip);
    // A sample that can't be equipped as written is a mistake in it, not an example.
    if (check.outcome !== "allowed") throw new Error(`docs/sample: ${check.block?.message ?? "blocked"}`);
  }
  // Before the trades, while the sample still has a slot from a grant.
  const equipment = equipmentExample(await store.sheet(character.id), ref);
  for (const { id, trade } of added) {
    if (trade) await store.markTraded(id, trade);
  }
  return { store, characterId: character.id, ref, equipment };
}

/** DOC-4: the record check on the sample character's Skills page (SK-6). */
async function recordCheckExample({ store, characterId, ref }: SampleAccount): Promise<string> {
  const missing = recordCheck(await store.sheet(characterId), ref);
  if (missing.length === 0) throw new Error("docs/sample: the record check example needs a level with no skill");
  return ["```text", ...missing.map((m) => m.message), "```"].join("\n");
}

/** DOC-4: the sample character's totals as its page shows them, and where its CM comes from (GR-7 to GR-12). */
async function totalsExample({ store, characterId }: SampleAccount): Promise<string> {
  const view = totalsView(await store.totals(characterId));
  const lines = [view.classBonus];
  for (const t of view.totals) lines.push(t.heading, ...(t.breakdown ? [`  ${t.breakdown}`] : []));
  lines.push(view.dice);
  const cm = view.totals[0]!;
  return [
    "```text",
    ...lines,
    "```",
    "",
    `**Where ${cm.label} comes from:**`,
    "",
    ...cm.grants.map((g) => `- ${g}`),
    "",
    "**Situational, not added in:**",
    "",
    ...cm.situational.map((g) => `- ${g}`),
  ].join("\n");
}

/** DOC-4: the sample character's over-limit alert, after it traded the item that gave a slot (EQ-8). */
async function alertExample({ store, characterId }: SampleAccount): Promise<string> {
  const alerts = await store.alerts(characterId);
  if (alerts.length === 0) throw new Error("docs/sample: the alert example needs the sample to be over a limit");
  return alerts.map((a) => `> ${a.message}`).join("\n>\n");
}

/** Each example by name: the Markdown that goes between its markers. */
export async function docsExamples(root: string): Promise<Record<string, string>> {
  const account = await sampleAccount(root);
  return {
    // EX-5: the whole JSON export of the sample account.
    "json-example": ["```json", JSON.stringify(await account.store.exportJson(), null, 2), "```"].join("\n"),
    "totals-example": await totalsExample(account),
    "alert-example": await alertExample(account),
    "equipment-example": account.equipment,
    "record-check-example": await recordCheckExample(account),
  };
}
