// Limits (NF-6): text fields and counts have sensible maximums, so a mistake
// or misuse can't run up hosting costs. The exact maximums are the code's
// choice; these tests check that ordinary sizes are fine and absurd ones are
// refused, naming the field. Text with a broken character, such as half of an
// emoji, is refused too, naming the field.

import { expect } from "vitest";
import { ValidationError } from "../../src/errors";
import type { ItemEntry } from "../../src/rules/types";
import { rule } from "../support/rule";
import { seedProfile, world } from "../support/world";

async function bramWithRook() {
  const w = world();
  const bram = w.as("bram");
  await seedProfile(bram, "bram");
  const rook = await bram.createCharacter({ name: "Rook", className: "Warrior", level: 1 });
  return { bram, id: rook.id };
}

rule(
  { req: ["NF-6"], m: "M2" },
  "a description of a few thousand characters is fine; a hundred thousand is refused",
  async () => {
    const { bram, id } = await bramWithRook();
    const ok = await bram.addEntry(id, { category: "consumables", name: "Long Tonic", description: "x".repeat(3000) });
    expect(ok.description?.length, "a 3,000-character description").toBe(3000);
    const attempt = bram.addEntry(id, {
      category: "consumables",
      name: "Huge Tonic",
      description: "x".repeat(100_000),
    });
    await expect(attempt, "a 100,000-character description").rejects.toThrow(ValidationError);
    await expect(attempt, "a 100,000-character description").rejects.toMatchObject({ field: "description" });
  },
);

rule({ req: ["NF-6"], m: "M2" }, "names, notes and display names have maximums too", async () => {
  const { bram, id } = await bramWithRook();
  const cases: [string, string, () => Promise<unknown>][] = [
    ["an entry name", "name", () => bram.addEntry(id, { category: "consumables", name: "n".repeat(10_000) })],
    [
      "entry notes",
      "notes",
      () => bram.addEntry(id, { category: "consumables", name: "Tonic", notes: "n".repeat(100_000) }),
    ],
    ["a character name", "name", () => bram.createCharacter({ name: "c".repeat(10_000), className: "Mage", level: 1 })],
    ["character notes", "notes", () => bram.updateCharacter(id, { notes: "n".repeat(100_000) })],
    ["a title", "name", () => bram.addTitle({ name: "t".repeat(10_000) })],
    ["a display name", "displayName", () => bram.setDisplayName("d".repeat(10_000))],
    [
      "a report message",
      "message",
      () => bram.sendReport({ kind: "bug", subject: "Long", message: "m".repeat(100_000) }),
    ],
  ];
  for (const [what, field, attempt] of cases) {
    await expect(attempt(), `an absurdly long ${what}`).rejects.toMatchObject({ field });
  }
});

rule({ req: ["NF-6"], m: "M2" }, "edits have the same maximums as new records, naming the field", async () => {
  const { bram, id } = await bramWithRook();
  const tonic = await bram.addEntry(id, { category: "consumables", name: "Tonic", quantity: 5 });
  const title = await bram.addTitle({ name: "Made-up Title" });
  const huge = "x".repeat(100_000);
  const long = "x".repeat(10_000);
  const cases: [string, string, () => Promise<unknown>][] = [
    ["an edited description", "description", () => bram.updateEntry(tonic.id, { description: huge })],
    ["edited entry notes", "notes", () => bram.updateEntry(tonic.id, { notes: huge })],
    ["an edited title name", "name", () => bram.updateTitle(title.id, { name: long })],
    ["an edited title description", "description", () => bram.updateTitle(title.id, { description: huge })],
    ["a note on a use", "note", () => bram.markUsed(tonic.id, { note: huge })],
    ["a note on a trade", "note", () => bram.markTraded(tonic.id, { kind: "traded", quantity: 1, note: huge })],
    [
      "a weapon group",
      "weaponGroup",
      () => bram.addEntry(id, { category: "weapons", name: "Blade", hands: 1, range: "melee", weaponGroup: long }),
    ],
    [
      "an item family",
      "itemFamily",
      () => bram.addEntry(id, { category: "items", name: "Charm", arcane: false, itemFamily: long }),
    ],
    [
      "an ally type",
      "allyType",
      () => bram.addEntry(id, { category: "allies", name: "Cat", active: false, allyType: long }),
    ],
    ["a component tier", "tier", () => bram.addEntry(id, { category: "components", name: "Pebble", tier: long })],
    [
      "skill notes",
      "notes",
      () => bram.addSkill(id, { skillId: "blade-basics", howGained: "starting", levelGained: 1, notes: huge }),
    ],
  ];
  for (const [what, field, attempt] of cases) {
    await expect(attempt(), `an absurdly long ${what}`).rejects.toMatchObject({ field });
  }
  const after = await bram.entry(tonic.id);
  expect(after.category, "Rook's Tonic's category").toBe("consumables");
  const tonicAfter = after as Exclude<typeof after, { category: "skills" }>;
  expect(
    [tonicAfter.quantity, tonicAfter.description, tonicAfter.notes],
    "Rook's Tonic after the refused edits",
  ).toEqual([5, undefined, undefined]);
  expect(
    (await bram.listTitles()).map((t) => [t.name, t.description]),
    "Bram's titles after the refused edits",
  ).toEqual([["Made-up Title", undefined]]);
  expect((await bram.listEntries(id, "skills")).length, "Rook's skills after the refused one").toBe(0);
});

rule(
  { req: ["NF-6", "IN-11", "SP-1"], m: "M3" },
  "a gain's source and link, and a report's subject, have maximums, naming the field",
  async () => {
    const { bram, id } = await bramWithRook();
    const long = "x".repeat(10_000);
    const charm = { category: "items", name: "Charm", arcane: false } as const;
    const cases: [string, string, () => Promise<unknown>][] = [
      ["a source", "source", () => bram.addEntry(id, charm, { source: long })],
      ["a link", "link", () => bram.addEntry(id, charm, { link: `https://example.test/${long}` })],
      ["a report subject", "subject", () => bram.sendReport({ kind: "bug", subject: long, message: "Short." })],
    ];
    for (const [what, field, attempt] of cases) {
      await expect(attempt(), `an absurdly long ${what}`).rejects.toMatchObject({ field });
    }
    expect((await bram.listEntries(id, "items")).length, "Rook's items after the refused gains").toBe(0);
    expect((await bram.reports()).length, "Bram's reports after the refused one").toBe(0);
  },
);

rule(
  { req: ["NF-6"], m: "M2" },
  "text with half an emoji is refused, naming the field; a whole emoji is fine",
  async () => {
    const { bram, id } = await bramWithRook();
    // Half of a two-part emoji: a lone high or low UTF-16 surrogate.
    const high = String.fromCharCode(0xd83d);
    const low = String.fromCharCode(0xdc09);
    const charm = await bram.addEntry(id, { category: "items", name: "Charm", arcane: false });
    const whole = await bram.addEntry(id, { category: "consumables", name: "Dragon Tonic 🐉", notes: "🐉🐉" });
    expect([whole.name, whole.notes], "Rook's Dragon Tonic with whole emoji").toEqual(["Dragon Tonic 🐉", "🐉🐉"]);
    const cases: [string, string, () => Promise<unknown>][] = [
      ["an entry name", "name", () => bram.addEntry(id, { category: "consumables", name: `Tonic ${high}` })],
      [
        "entry notes",
        "notes",
        () => bram.addEntry(id, { category: "consumables", name: "Tonic", notes: `${low} cut off` }),
      ],
      ["a character name", "name", () => bram.createCharacter({ name: `Wren${high}`, className: "Mage", level: 1 })],
      ["character notes", "notes", () => bram.updateCharacter(id, { notes: `Fang ${high}x` })],
      ["a title", "name", () => bram.addTitle({ name: `${low}Title` })],
      ["a display name", "displayName", () => bram.setDisplayName(`Bram ${high}`)],
      [
        "a report message",
        "message",
        () => bram.sendReport({ kind: "bug", subject: "Cut off", message: `Pasted ${high}` }),
      ],
      [
        "a grant's condition",
        "grants",
        () => bram.addGrant({ entryId: charm.id }, { kind: "cm", amount: 1, condition: `vs ${low}` }),
      ],
    ];
    for (const [what, field, attempt] of cases) {
      const refused = attempt();
      await expect(refused, `${what} with half an emoji`).rejects.toThrow(ValidationError);
      await expect(refused, `${what} with half an emoji`).rejects.toMatchObject({ field });
    }
    expect(
      (await bram.listEntries(id, "consumables")).map((e) => e.entry.id),
      "Rook's consumables after the refused ones: only the Dragon Tonic",
    ).toEqual([whole.id]);
    const charmAfter = (await bram.entry(charm.id)) as ItemEntry;
    expect(charmAfter.grants ?? [], "Rook's Charm's grants after the refused one").toEqual([]);
    expect((await bram.listTitles()).length, "Bram's titles after the refused one").toBe(0);
    expect((await bram.reports()).length, "Bram's reports after the refused one").toBe(0);
  },
);

rule({ req: ["NF-6"], m: "M2" }, "a character can have 1,000 entries, and the 1,001st is refused", async () => {
  const { bram, id } = await bramWithRook();
  for (let i = 1; i <= 1000; i++) await bram.addEntry(id, { category: "consumables", name: `Tonic ${i}` });
  const attempt = bram.addEntry(id, { category: "consumables", name: "Tonic 1001" });
  await expect(attempt, "the 1,001st entry").rejects.toThrow(ValidationError);
  await expect(attempt, "the 1,001st entry").rejects.toThrow(/1,?000/);
  expect((await bram.listEntries(id, "consumables")).length, "Rook's consumables").toBe(1000);
});

rule(
  { req: ["NF-6", "IN-15"], m: "M4" },
  "Undo can't take a character past 1,000 entries, and the refusal says so",
  async () => {
    const { bram, id } = await bramWithRook();
    for (let i = 1; i <= 1000; i++) await bram.addEntry(id, { category: "consumables", name: `Tonic ${i}` });
    const [first] = await bram.listEntries(id, "consumables");
    const deleted = await bram.deleteEntry(first!.entry.id);
    await bram.addEntry(id, { category: "consumables", name: "Tonic 1001" });
    const attempt = deleted.undo();
    await expect(attempt, "Undo with 1,000 entries again").rejects.toThrow(ValidationError);
    await expect(attempt, "the refusal").rejects.toThrow(/1,?000/);
    expect((await bram.listEntries(id, "consumables")).length, "Rook's consumables").toBe(1000);
  },
);

rule({ req: ["NF-6", "IN-1"], m: "M2" }, "a quantity has a maximum: 999 is fine, a billion is refused", async () => {
  const { bram, id } = await bramWithRook();
  expect(
    (await bram.addEntry(id, { category: "components", name: "Pebble", quantity: 999 })).quantity,
    "999 pebbles",
  ).toBe(999);
  const attempt = bram.addEntry(id, { category: "components", name: "Sand", quantity: 1_000_000_000 });
  await expect(attempt, "a billion grains of sand").rejects.toMatchObject({ field: "quantity" });
});
