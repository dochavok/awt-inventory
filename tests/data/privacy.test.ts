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

rule(
  { req: ["PV-1", "SE-1", "SE-3", "EX-1", "HI-5"], m: "M3" },
  "Cass and a signed-out visitor are refused the sheet, PDF, search, filters, title scopes, class corrections and the rest",
  async () => {
    const x = await setUp();
    const wren = await x.bram.createCharacter({ name: "Wren", className: "Rogue", level: 3 });
    await x.bram.retireCharacter(wren.id);
    const wolfId = (await x.bram.listEntries(x.characterId, "allies")).find(
      (e) => e.entry.category === "allies" && e.entry.name === "Grey Fang",
    )!.entry.id;
    const print = { characterIds: [x.characterId], includeSkillText: false, paper: "letter" as const };
    const more: [string, (s: InventoryStore) => Promise<unknown>][] = [
      ["print Aldric's sheet", (s) => s.printableSheet(print)],
      ["make Aldric's PDF", (s) => s.printablePdf(print)],
      ["search Aldric", (s) => s.search("Draught", { characterId: x.characterId })],
      ["list Aldric's Epic armor", (s) => s.listEntries(x.characterId, "armor", { rarity: "epic" })],
      ["list Aldric's Emberforged armor", (s) => s.listEntries(x.characterId, "armor", { itemFamily: "Emberforged" })],
      ["filter Aldric's history", (s) => s.history(x.characterId, { categories: ["consumables"] })],
      ["list Aldric's titles", (s) => s.titlesFor(x.characterId)],
      [
        "make Bram's title Aldric's own",
        (s) => s.setTitleScope(x.titleId, { level: "character", characterId: x.characterId }),
      ],
      ["read the notice for correcting Aldric's class", (s) => s.classCorrectionNotice(x.characterId, "Mage")],
      ["correct Aldric's class", (s) => s.correctClass(x.characterId, "Mage", { confirmed: true })],
      ["bring Wren back from retirement", (s) => s.restoreCharacter(wren.id)],
      ["make Grey Fang inactive", (s) => s.setActive(wolfId, false)],
    ];
    for (const [who, store] of [
      ["Cass", x.cass],
      ["a signed-out visitor", x.nobody],
    ] as const) {
      for (const [what, attempt] of more) {
        await expect(attempt(store), `${who} trying to ${what}`).rejects.toThrow(AccessDeniedError);
      }
    }
    expect((await x.bram.character(x.characterId)).className, "Aldric's class").toBe("Warrior");
    expect(
      (await x.bram.listCharacters("retired")).map((c) => c.name),
      "Bram's retired characters",
    ).toEqual(["Wren"]);
    expect((await x.bram.listTitles())[0]?.scope, "the scope of Friend of the Forest").toEqual({ level: "player" });
    const wolf = await x.bram.entry(wolfId);
    expect(wolf.category === "allies" && wolf.active, "Grey Fang active").toBe(true);
  },
);

rule({ req: ["PV-3"], m: "M2" }, "the data layer has no way to browse other users", async () => {
  const x = await setUp();
  const browsing = Object.keys(x.bram).filter((m) => /users|accounts|everyone|admin/i.test(m));
  expect(browsing, "store methods that could browse other users").toEqual([]);
  await x.bram.listCharacters("main");
});
