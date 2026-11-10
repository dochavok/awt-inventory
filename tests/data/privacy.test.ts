// Privacy through the data layer (PV-1, PV-3): another user, or nobody signed
// in, can't read or change anything of Bram's. The same rules are enforced
// on the server and tested against the emulator in tests/access/.

import { expect } from "vitest";
import type { InventoryStore } from "../../src/data/store";
import { AccessDeniedError } from "../../src/errors";
import { rule } from "../support/rule";
import { seedCharacter, seedProfile, world } from "../support/world";

async function setUp() {
  const w = world();
  const bram = w.as("bram");
  await seedProfile(bram, "bram");
  const aldric = await seedCharacter(bram, "aldric");
  const cass = w.as("cass");
  await seedProfile(cass, "cass");
  await seedCharacter(cass, "brin");
  const characterId = aldric.character.id;
  const entryId = aldric.entries.get("aldric-draught")!.id;
  const title = (await bram.listTitles())[0]!;
  const used = await bram.markUsed(entryId);
  return { w, bram, cass, nobody: w.as(null), characterId, entryId, titleId: title.id, usedId: used.id };
}

type Setup = Awaited<ReturnType<typeof setUp>>;

/** Every way to reach one of Bram's records. */
const attempts: [string, (s: InventoryStore, x: Setup) => Promise<unknown>][] = [
  ["read Aldric", (s, x) => s.character(x.characterId)],
  ["read Aldric's sheet", (s, x) => s.sheet(x.characterId)],
  ["list Aldric's consumables", (s, x) => s.listEntries(x.characterId, "consumables")],
  ["read a Healing Draught", (s, x) => s.entry(x.entryId)],
  ["read Aldric's history", (s, x) => s.history(x.characterId)],
  ["read Aldric's skills", (s, x) => s.skills(x.characterId)],
  ["rename Aldric", (s, x) => s.updateCharacter(x.characterId, { name: "Stolen" })],
  ["retire Aldric", (s, x) => s.retireCharacter(x.characterId)],
  ["delete Aldric", (s, x) => s.deleteCharacter(x.characterId, "Aldric")],
  ["add an entry to Aldric", (s, x) => s.addEntry(x.characterId, { category: "consumables", name: "Planted" })],
  ["edit a Healing Draught", (s, x) => s.updateEntry(x.entryId, { quantity: 99 })],
  ["use a Healing Draught", (s, x) => s.markUsed(x.entryId)],
  ["restore a used draught", (s, x) => s.restoreUsed(x.usedId)],
  ["trade a Healing Draught", (s, x) => s.markTraded(x.entryId, { kind: "traded" })],
  ["delete a Healing Draught", (s, x) => s.deleteEntry(x.entryId)],
  [
    "add a skill to Aldric",
    (s, x) => s.addSkill(x.characterId, { skillId: "twin-fangs", howGained: "other", levelGained: 1 }),
  ],
  ["edit Bram's title", (s, x) => s.updateTitle(x.titleId, { name: "Stolen" })],
  ["remove Bram's title", (s, x) => s.removeTitle(x.titleId)],
  ["list the characters of Bram's title", (s, x) => s.charactersFor(x.titleId)],
];

rule({ req: ["PV-1"], m: "M2" }, "Cass is refused every read and change of Bram's records", async () => {
  const x = await setUp();
  for (const [what, attempt] of attempts) {
    await expect(attempt(x.cass, x), `Cass trying to ${what}`).rejects.toThrow(AccessDeniedError);
  }
  expect((await x.bram.character(x.characterId)).name, "Aldric's name").toBe("Aldric");
  expect((await x.bram.entry(x.entryId)).quantity, "Bram's Healing Draughts").toBe(2);
  expect(
    (await x.bram.listTitles()).map((t) => t.name),
    "Bram's titles",
  ).toEqual(["Friend of the Forest"]);
});

rule({ req: ["PV-1"], m: "M2" }, "nobody signed in is refused everything, even their own profile", async () => {
  const x = await setUp();
  for (const [what, attempt] of attempts) {
    await expect(attempt(x.nobody, x), `a signed-out visitor trying to ${what}`).rejects.toThrow(AccessDeniedError);
  }
  await expect(x.nobody.profile(), "a signed-out visitor reading a profile").rejects.toThrow(AccessDeniedError);
  await expect(x.nobody.listCharacters("main"), "a signed-out visitor listing characters").rejects.toThrow(
    AccessDeniedError,
  );
});

rule(
  { req: ["PV-1", "PV-3"], m: "M2" },
  "listing and searching only ever show the signed-in user's own records",
  async () => {
    const x = await setUp();
    expect(
      (await x.cass.listCharacters("main")).map((c) => c.name),
      "Cass's characters",
    ).toEqual(["Brin"]);
    expect(
      (await x.cass.listTitles()).map((t) => t.name),
      "Cass's titles",
    ).toEqual([]);
    expect(
      (await x.bram.listCharacters("main")).map((c) => c.name),
      "Bram's characters",
    ).toEqual(["Aldric"]);
  },
);

rule({ req: ["PV-1", "PV-3", "SE-2"], m: "M3" }, "searching all characters finds only the user's own", async () => {
  const x = await setUp();
  const results = await x.cass.search("Draught", { allCharacters: true });
  expect(results, "Cass's results for Draught").toEqual([]);
  const dagger = await x.cass.search("Thornneedle", { allCharacters: true });
  expect(
    dagger.map((r) => r.characterName),
    "Cass's results for Thornneedle",
  ).toEqual(["Brin"]);
});

rule({ req: ["PV-3"], m: "M2" }, "the data layer has no way to browse other users", async () => {
  const x = await setUp();
  const browsing = Object.keys(x.bram).filter((m) => /users|accounts|everyone|admin/i.test(m));
  expect(browsing, "store methods that could browse other users").toEqual([]);
  await x.bram.listCharacters("main");
});
