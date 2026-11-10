// Characters (section 4.1: CH-1 to CH-6), through the data layer.

import { expect } from "vitest";
import { ConfirmationError, NotFoundError, ValidationError } from "../../src/errors";
import { rule } from "../support/rule";
import { seedCharacter, seedProfile, world } from "../support/world";

async function bramsWorld() {
  const w = world();
  const bram = w.as("bram");
  await seedProfile(bram, "bram");
  return { w, bram };
}

rule({ req: ["CH-1"], m: "M2" }, "a character is created with a name, class, level and notes", async () => {
  const { bram } = await bramsWorld();
  const wren = await bram.createCharacter({ name: "Wren", className: "Rogue", level: 3, notes: "Made-up notes" });
  expect(await bram.character(wren.id), "Wren as stored").toMatchObject({
    name: "Wren",
    className: "Rogue",
    level: 3,
    notes: "Made-up notes",
  });
});

rule(
  { req: ["CH-1"], m: "M2" },
  "a user's characters must have different names, ignoring case; the refusal names the clash",
  async () => {
    const { bram } = await bramsWorld();
    await bram.createCharacter({ name: "Wren", className: "Rogue", level: 3 });
    const attempt = bram.createCharacter({ name: "wREN", className: "Mage", level: 1 });
    await expect(attempt, "a second Wren").rejects.toThrow(ValidationError);
    await expect(attempt, "a second Wren").rejects.toMatchObject({ field: "name" });
    await expect(attempt, "a second Wren").rejects.toThrow(/Wren/);
    expect((await bram.listCharacters("main")).length, "Bram's number of characters").toBe(1);
  },
);

rule({ req: ["CH-1"], m: "M2" }, "different users may use the same character name", async () => {
  const { w, bram } = await bramsWorld();
  const cass = w.as("cass");
  await seedProfile(cass, "cass");
  await bram.createCharacter({ name: "Wren", className: "Rogue", level: 3 });
  const hers = await cass.createCharacter({ name: "Wren", className: "Mage", level: 5 });
  expect(hers.name, "Cass's Wren").toBe("Wren");
});

rule(
  { req: ["CH-1", "CH-3", "RD-5"], m: "M2" },
  "a level must be from 1 to the chart's highest level (30 in the test data)",
  async () => {
    const { bram } = await bramsWorld();
    for (const level of [0, 31, 2.5]) {
      const attempt = bram.createCharacter({ name: `Rook ${level}`, className: "Warrior", level });
      await expect(attempt, `creating a character at level ${level}`).rejects.toThrow(ValidationError);
      await expect(attempt, `creating a character at level ${level}`).rejects.toMatchObject({ field: "level" });
    }
    expect((await bram.createCharacter({ name: "Rook", className: "Warrior", level: 30 })).level, "level 30").toBe(30);
  },
);

rule({ req: ["CH-1"], m: "M2" }, "a class must be Warrior, Mage or Rogue", async () => {
  const { bram } = await bramsWorld();
  const attempt = bram.createCharacter({ name: "Rook", className: "Bard" as "Rogue", level: 1 });
  await expect(attempt, "a Bard").rejects.toMatchObject({ field: "className" });
});

rule({ req: ["CH-2"], m: "M2" }, "a character's name, level and notes can be changed", async () => {
  const { bram } = await bramsWorld();
  const { character } = await seedCharacter(bram, "aldric");
  await bram.updateCharacter(character.id, { name: "Aldric the Bold", level: 26, notes: "New notes" });
  expect(await bram.character(character.id), "Aldric after editing").toMatchObject({
    name: "Aldric the Bold",
    level: 26,
    notes: "New notes",
    className: "Warrior",
  });
});

rule({ req: ["CH-2", "CH-1"], m: "M2" }, "renaming a character to another of the user's names is refused", async () => {
  const { bram } = await bramsWorld();
  const { character } = await seedCharacter(bram, "aldric");
  await seedCharacter(bram, "isolde");
  await expect(bram.updateCharacter(character.id, { name: "ISOLDE" }), "renaming Aldric to ISOLDE").rejects.toThrow(
    /Isolde/,
  );
  expect((await bram.character(character.id)).name, "Aldric's name").toBe("Aldric");
});

rule(
  { req: ["CH-3", "HI-2", "HI-3"], m: "M2" },
  "a level change is recorded in the history as Level 25 → 26, dated now",
  async () => {
    const { w, bram } = await bramsWorld();
    const { character } = await seedCharacter(bram, "aldric");
    await bram.updateCharacter(character.id, { level: 26 });
    const [record] = (await bram.history(character.id)).filter((r) => r.event === "level-changed");
    expect(record, "Aldric's level change record").toMatchObject({
      event: "level-changed",
      change: { from: 25, to: 26 },
      summary: "Level 25 → 26",
      date: w.clock.iso(),
    });
  },
);

rule({ req: ["CH-3"], m: "M2" }, "editing only the name or notes records no level change", async () => {
  const { bram } = await bramsWorld();
  const { character } = await seedCharacter(bram, "aldric");
  await bram.updateCharacter(character.id, { notes: "Only the notes" });
  const levelRecords = (await bram.history(character.id)).filter((r) => r.event === "level-changed");
  expect(levelRecords, "Aldric's level change records").toEqual([]);
});

rule(
  { req: ["CH-2a"], m: "M2" },
  "the class correction warning says it isn't a normal change and lists what it affects",
  async () => {
    const { bram } = await bramsWorld();
    const { character } = await seedCharacter(bram, "aldric");
    const notice = await bram.classCorrectionNotice(character.id, "Mage");
    expect(notice.to, "the class it would become").toBe("Mage");
    expect([...notice.affects].sort(), "what a class correction affects").toEqual([
      "arcane slots",
      "class bonus",
      "combat dice",
      "hearts",
      "own skill trees",
    ]);
    expect(notice.message, "the warning").toMatch(/mistake/i);
  },
);

rule({ req: ["CH-2a"], m: "M2" }, "a class correction needs confirming, and without it nothing changes", async () => {
  const { bram } = await bramsWorld();
  const { character } = await seedCharacter(bram, "aldric");
  await expect(
    bram.correctClass(character.id, "Rogue", { confirmed: false }),
    "an unconfirmed correction",
  ).rejects.toThrow(ConfirmationError);
  expect((await bram.character(character.id)).className, "Aldric's class").toBe("Warrior");
  expect(
    (await bram.history(character.id)).filter((r) => r.event === "class-corrected"),
    "class records",
  ).toEqual([]);
});

rule(
  { req: ["CH-2a", "HI-2"], m: "M2" },
  "a confirmed correction changes the class and is recorded as Class corrected: Warrior → Rogue",
  async () => {
    const { bram } = await bramsWorld();
    const { character } = await seedCharacter(bram, "aldric");
    await bram.correctClass(character.id, "Rogue", { confirmed: true });
    expect((await bram.character(character.id)).className, "Aldric's class").toBe("Rogue");
    const [record] = (await bram.history(character.id)).filter((r) => r.event === "class-corrected");
    expect(record, "the class correction record").toMatchObject({
      change: { from: "Warrior", to: "Rogue" },
      summary: "Class corrected: Warrior → Rogue",
    });
  },
);

rule({ req: ["CH-4"], m: "M2" }, "there's no limit on how many characters a user can have (60 here)", async () => {
  const { bram } = await bramsWorld();
  for (let i = 1; i <= 60; i++) await bram.createCharacter({ name: `Rook ${i}`, className: "Warrior", level: 1 });
  expect((await bram.listCharacters("main")).length, "Bram's number of characters").toBe(60);
});

rule(
  { req: ["CH-5"], m: "M2" },
  "a retired character leaves the main list for Retired, unchanged, and can come back",
  async () => {
    const { bram } = await bramsWorld();
    const aldric = await seedCharacter(bram, "aldric");
    await seedCharacter(bram, "isolde");
    const before = await bram.sheet(aldric.character.id);
    await bram.retireCharacter(aldric.character.id);
    expect(
      (await bram.listCharacters("main")).map((c) => c.name),
      "Bram's main list",
    ).toEqual(["Isolde"]);
    expect(
      (await bram.listCharacters("retired")).map((c) => c.name),
      "Bram's retired list",
    ).toEqual(["Aldric"]);
    const after = await bram.sheet(aldric.character.id);
    expect(after.entries, "Aldric's entries while retired").toEqual(before.entries);
    await bram.restoreCharacter(aldric.character.id);
    expect(
      (await bram.listCharacters("main")).map((c) => c.name).sort(),
      "Bram's main list after bringing Aldric back",
    ).toEqual(["Aldric", "Isolde"]);
  },
);

rule({ req: ["CH-5", "TI-2"], m: "M2" }, "player-level titles still list a retired character", async () => {
  const { bram } = await bramsWorld();
  const aldric = await seedCharacter(bram, "aldric");
  const title = (await bram.listTitles()).find((t) => t.name === "Friend of the Forest")!;
  await bram.retireCharacter(aldric.character.id);
  expect(
    (await bram.charactersFor(title.id)).map((c) => c.name),
    "characters listed by Friend of the Forest",
  ).toContain("Aldric");
});

rule(
  { req: ["CH-6"], m: "M2" },
  "deleting a character needs its name typed; a wrong name deletes nothing",
  async () => {
    const { bram } = await bramsWorld();
    const { character } = await seedCharacter(bram, "aldric");
    const attempt = bram.deleteCharacter(character.id, "Aldrik");
    await expect(attempt, "deleting with the wrong name").rejects.toThrow(ConfirmationError);
    await expect(attempt, "deleting with the wrong name").rejects.toMatchObject({ expected: "Aldric" });
    expect((await bram.character(character.id)).name, "Aldric, still there").toBe("Aldric");
  },
);

rule({ req: ["CH-6", "HI-4"], m: "M2" }, "deleting a character removes it with its entries and history", async () => {
  const { bram } = await bramsWorld();
  const { character, entries } = await seedCharacter(bram, "aldric");
  await bram.deleteCharacter(character.id, "Aldric");
  await expect(bram.character(character.id), "reading the deleted Aldric").rejects.toThrow(NotFoundError);
  await expect(bram.history(character.id), "reading the deleted Aldric's history").rejects.toThrow(NotFoundError);
  await expect(bram.entry(entries.get("aldric-sword")!.id), "reading Duskfang").rejects.toThrow(NotFoundError);
  expect(await bram.listCharacters("main"), "Bram's characters").toEqual([]);
});

rule(
  { req: ["CH-6", "TI-2"], m: "M2" },
  "deleting a character deletes its character-level titles but keeps player-level ones",
  async () => {
    const { bram } = await bramsWorld();
    const { character } = await seedCharacter(bram, "aldric");
    await bram.addTitle({ name: "Hero of the Bridge", scope: { level: "character", characterId: character.id } });
    await bram.deleteCharacter(character.id, "Aldric");
    expect(
      (await bram.listTitles()).map((t) => t.name),
      "Bram's titles",
    ).toEqual(["Friend of the Forest"]);
  },
);
