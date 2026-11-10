// Limits (NF-6): text fields and counts have sensible maximums, so a mistake
// or misuse can't run up hosting costs. The exact maximums are the code's
// choice; these tests check that ordinary sizes are fine and absurd ones are
// refused, naming the field.

import { expect } from "vitest";
import { ValidationError } from "../../src/errors";
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

rule({ req: ["NF-6"], m: "M2" }, "a character can have 1,000 entries, and the 1,001st is refused", async () => {
  const { bram, id } = await bramWithRook();
  for (let i = 1; i <= 1000; i++) await bram.addEntry(id, { category: "consumables", name: `Tonic ${i}` });
  const attempt = bram.addEntry(id, { category: "consumables", name: "Tonic 1001" });
  await expect(attempt, "the 1,001st entry").rejects.toThrow(ValidationError);
  await expect(attempt, "the 1,001st entry").rejects.toThrow(/1,?000/);
  expect((await bram.listEntries(id, "consumables")).length, "Rook's consumables").toBe(1000);
});

rule({ req: ["NF-6", "IN-1"], m: "M2" }, "a quantity has a maximum: 999 is fine, a billion is refused", async () => {
  const { bram, id } = await bramWithRook();
  expect(
    (await bram.addEntry(id, { category: "components", name: "Pebble", quantity: 999 })).quantity,
    "999 pebbles",
  ).toBe(999);
  const attempt = bram.addEntry(id, { category: "components", name: "Sand", quantity: 1_000_000_000 });
  await expect(attempt, "a billion grains of sand").rejects.toMatchObject({ field: "quantity" });
});
