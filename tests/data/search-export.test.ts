// Search and export (section 10: SE-1 to SE-3, EX-1 to EX-5), through the
// data layer. The PDF is checked as data (SheetDocument) and as a file.

import { PDFDocument } from "pdf-lib";
import { expect } from "vitest";
import { rule } from "../support/rule";
import { seedCharacter, seedProfile, world } from "../support/world";

async function bramWithTwo(options: { full?: boolean; showSkillText?: boolean } = {}) {
  const w = world({ showSkillText: options.showSkillText ?? false });
  const bram = w.as("bram");
  await seedProfile(bram, "bram");
  const aldric = await seedCharacter(bram, "aldric", options);
  const isolde = await seedCharacter(bram, "isolde", options);
  return { w, bram, aldric, isolde };
}

// ---------------------------------------------------------------- search (SE)

rule(
  { req: ["SE-1"], m: "M3" },
  "searching a character finds entries by name, description and notes, skills included, with their category",
  async () => {
    const { bram, aldric } = await bramWithTwo();
    const id = aldric.character.id;
    await bram.updateEntry(aldric.entries.get("aldric-lantern")!.id, {
      description: "Made-up text about a dusk lamp.",
    });
    await bram.updateEntry(aldric.entries.get("aldric-shard")!.id, { notes: "Trade at dusk" });
    const results = await bram.search("dusk", { characterId: id });
    expect(results.map((r) => [r.name, r.category, r.matched]).sort(), "Aldric's results for dusk").toEqual([
      ["Duskfang", "weapons", ["name"]],
      ["Ember Shard", "components", ["notes"]],
      ["Hooded Lantern", "items", ["description"]],
    ]);
    const skills = await bram.search("guard", { characterId: id });
    expect(
      skills.map((r) => [r.name, r.category]),
      "Aldric's results for guard",
    ).toEqual([["Iron Guard", "skills"]]);
  },
);

rule(
  { req: ["SE-1", "SE-2"], m: "M3" },
  "searching one character finds nothing from the user's other characters; searching all of them does",
  async () => {
    const { bram, aldric } = await bramWithTwo();
    expect(await bram.search("orb", { characterId: aldric.character.id }), "Aldric's results for orb").toEqual([]);
    const everywhere = await bram.search("orb", { allCharacters: true });
    expect(
      everywhere.map((r) => `${r.characterName}: ${r.name}`),
      "results for orb across Bram's characters",
    ).toEqual(["Isolde: Glass Orb"]);
  },
);

rule({ req: ["SE-1"], m: "M3" }, "searching a character finds a skill by its notes", async () => {
  const { bram, aldric } = await bramWithTwo();
  const id = aldric.character.id;
  await bram.addSkill(id, {
    skillId: "twin-fangs",
    howGained: "other",
    levelGained: 1,
    notes: "Practised at moonrise",
  });
  const results = await bram.search("moonrise", { characterId: id });
  expect(
    results.map((r) => [r.name, r.category, r.matched]),
    "Aldric's results for moonrise",
  ).toEqual([["Twin Fangs", "skills", ["notes"]]]);
});

rule({ req: ["SE-1"], m: "M3" }, "search ignores case and matches the start of a word as it's typed", async () => {
  const { bram, aldric } = await bramWithTwo();
  for (const query of ["D", "Du", "DUSKF"]) {
    const names = (await bram.search(query, { characterId: aldric.character.id })).map((r) => r.name);
    expect(names, `Aldric's results for "${query}"`).toContain("Duskfang");
  }
});

rule(
  { req: ["SE-1"], m: "M3" },
  "search matches inside a word too, with matches at the start of a word first",
  async () => {
    const { bram, aldric } = await bramWithTwo();
    const id = aldric.character.id;
    await bram.addSkill(id, { skillId: "twin-fangs", howGained: "other", levelGained: 1 });
    const names = (await bram.search("fang", { characterId: id })).map((r) => r.name);
    expect(names, `Aldric's results for "fang", in order`).toEqual(["Grey Fang", "Twin Fangs", "Duskfang"]);
  },
);

rule(
  { req: ["SE-1"], m: "M3" },
  "with several words typed, a result comes first only if every word starts a word",
  async () => {
    const { bram, aldric } = await bramWithTwo();
    const id = aldric.character.id;
    await bram.addEntry(id, { category: "consumables", name: "Rune Fang" });
    const names = (await bram.search("fang r", { characterId: id })).map((r) => r.name);
    // In Grey Fang, "r" is only inside "grey".
    expect(names, `Aldric's results for "fang r", in order`).toEqual(["Rune Fang", "Grey Fang"]);
  },
);

rule({ req: ["SE-1"], m: "M3" }, "search ignores accents, however the phone wrote them", async () => {
  const { bram, aldric } = await bramWithTwo();
  const id = aldric.character.id;
  // é written as e plus an accent mark, as some keyboards and pasted text do.
  await bram.addEntry(id, { category: "consumables", name: "Café Tonic" });
  for (const query of ["café", "café", "afé", "cafe", "CAFE", "cafe tonic"]) {
    const names = (await bram.search(query, { characterId: id })).map((r) => r.name);
    expect(names, `Aldric's results for "${query}"`).toEqual(["Café Tonic"]);
  }
  // An accent in the middle of a word doesn't split it.
  await bram.addEntry(id, { category: "consumables", name: "Résine Salve" });
  const resine = (await bram.search("resine", { characterId: id })).map((r) => r.name);
  expect(resine, `Aldric's results for "resine"`).toEqual(["Résine Salve"]);
});

rule({ req: ["SE-1"], m: "M3" }, "with several words typed, each must be in the same field", async () => {
  const { bram, aldric } = await bramWithTwo();
  const id = aldric.character.id;
  await bram.updateEntry(aldric.entries.get("aldric-shard")!.id, { notes: "Trade at dusk" });
  const together = await bram.search("trade dusk", { characterId: id });
  expect(
    together.map((r) => [r.name, r.matched]),
    `Aldric's results for "trade dusk"`,
  ).toEqual([["Ember Shard", ["notes"]]]);
  // "shard" is only in its name and "dusk" only in its notes.
  expect(await bram.search("shard dusk", { characterId: id }), `Aldric's results for "shard dusk"`).toEqual([]);
});

rule(
  { req: ["SE-1", "SE-2"], m: "M3" },
  "searching all characters puts matches at the start of a word first, whichever character has them",
  async () => {
    const { bram, aldric } = await bramWithTwo();
    await bram.addEntry(aldric.character.id, { category: "consumables", name: "Absorbing Salve" });
    const results = await bram.search("orb", { allCharacters: true });
    expect(
      results.map((r) => `${r.characterName}: ${r.name}`),
      `results for "orb" across Bram's characters, in order`,
    ).toEqual(["Isolde: Glass Orb", "Aldric: Absorbing Salve"]);
  },
);

rule(
  { req: ["SE-2", "CH-5"], m: "M3" },
  "searching all characters includes retired ones, and each result names its character",
  async () => {
    const { bram, aldric } = await bramWithTwo();
    await bram.retireCharacter(aldric.character.id);
    const results = await bram.search("o", { allCharacters: true });
    const pairs = results.map((r) => `${r.characterName}: ${r.name}`);
    expect(pairs, "results across Bram's characters").toEqual(
      expect.arrayContaining(["Aldric: Old Mule", "Isolde: Glass Orb"]),
    );
  },
);

rule({ req: ["SE-3"], m: "M3" }, "a category list can be filtered by rarity and by item family", async () => {
  const { bram, aldric } = await bramWithTwo();
  const id = aldric.character.id;
  const epic = await bram.listEntries(id, "armor", { rarity: "epic" });
  expect(
    epic.map((e) => e.entry.category !== "skills" && e.entry.name),
    "Aldric's Epic armor",
  ).toEqual(["Ironclad Plate"]);
  const ember = await bram.listEntries(id, "armor", { itemFamily: "Emberforged" });
  expect(
    ember.map((e) => e.entry.category !== "skills" && e.entry.name),
    "Aldric's Emberforged armor",
  ).toEqual(["Ember Gauntlets"]);
});

rule({ req: ["SE-3"], m: "M4" }, "a category list can be filtered to what's equipped", async () => {
  const { bram, aldric } = await bramWithTwo({ full: true });
  const worn = await bram.listEntries(aldric.character.id, "armor", { equipped: true });
  expect(
    worn.map((e) => e.entry.category !== "skills" && e.entry.name),
    "Aldric's equipped armor",
  ).toEqual(["Ember Gauntlets", "Hawkeye Helm", "Ironclad Plate", "Stridewalk Boots"]);
});

// ---------------------------------------------------------------- printable sheet (EX-1 to EX-3)

rule(
  { req: ["EX-1"], m: "M3" },
  "the sheet for one character has its name, class, level, categories, skills, titles and notes",
  async () => {
    const { bram, aldric } = await bramWithTwo();
    const sheet = await bram.printableSheet({
      characterIds: [aldric.character.id],
      includeSkillText: false,
      paper: "letter",
    });
    expect(
      sheet.characters.map((c) => c.name),
      "characters on the sheet",
    ).toEqual(["Aldric"]);
    const page = sheet.characters[0]!;
    expect([page.className, page.level, page.notes], "Aldric's class, level and notes").toEqual([
      "Warrior",
      25,
      "Made-up test character.",
    ]);
    const consumables = page.categories.find((c) => c.category === "consumables")?.entries;
    expect(consumables, "Aldric's consumables with quantities").toEqual([{ name: "Healing Draught", quantity: 3 }]);
    const edge = page.skills.find((s) => s.name === "Veteran's Edge");
    expect(edge, "Veteran's Edge on the sheet").toMatchObject({ usage: "passive", tier: "normal" });
    expect(page.titles, "Aldric's titles").toEqual([{ name: "Friend of the Forest", description: "Made-up title." }]);
  },
);

rule({ req: ["EX-1", "CH-5"], m: "M3" }, "the sheet for all characters leaves out retired ones", async () => {
  const { bram, isolde } = await bramWithTwo();
  await bram.createCharacter({ name: "Wren", className: "Rogue", level: 3 });
  await bram.retireCharacter(isolde.character.id);
  const sheet = await bram.printableSheet({ characterIds: "all", includeSkillText: false, paper: "a4" });
  expect(sheet.characters.map((c) => c.name).sort(), "characters on the sheet").toEqual(["Aldric", "Wren"]);
});

rule(
  { req: ["EX-1", "SK-2"], q: ["Q10"], m: "M3" },
  "skill text is on the sheet only when ticked, and only once the owner has agreed",
  async () => {
    const shown = await bramWithTwo({ showSkillText: true });
    const spark = async (b: typeof shown, includeSkillText: boolean) =>
      (
        await b.bram.printableSheet({ characterIds: [b.isolde.character.id], includeSkillText, paper: "letter" })
      ).characters[0]!.skills.find((s) => s.name === "Spark");
    expect((await spark(shown, false))?.text, "Spark's text, not ticked").toBeUndefined();
    expect((await spark(shown, true))?.text, "Spark's text, ticked").toBe(
      "Made-up card text for tests: a small burst of sparks.",
    );
    const hidden = await bramWithTwo({ showSkillText: false });
    expect((await spark(hidden, true))?.text, "Spark's text, ticked, without the owner's agreement").toBeUndefined();
  },
);

rule(
  { req: ["EX-1"], m: "M4" },
  "once totals exist, the sheet shows them with their breakdowns, and what's equipped",
  async () => {
    const { bram, aldric } = await bramWithTwo({ full: true });
    const page = (
      await bram.printableSheet({ characterIds: [aldric.character.id], includeSkillText: false, paper: "letter" })
    ).characters[0]!;
    const cm = page.totals?.find((t) => t.label === "CM");
    expect(cm?.value, "Aldric's CM on the sheet").toBe(170);
    expect(
      cm?.lines.map((l) => [l.label, l.value]),
      "Aldric's CM lines on the sheet",
    ).toEqual([
      ["Combat Bonus", 63],
      ["Armor", 71],
      ["Weapons", 15],
      ["Skills", 11],
      ["Ally", 10],
    ]);
    expect(page.equipped, "Aldric's equipped entries on the sheet").toEqual(
      expect.arrayContaining([
        { slot: "Chest", entry: "Ironclad Plate" },
        { slot: "Main hand", entry: "Duskfang" },
        { slot: "Arcane", entry: "Amber Charm" },
      ]),
    );
  },
);

rule({ req: ["EX-1"], m: "M3" }, "the PDF prints on Letter or A4 paper", async () => {
  const { bram, aldric } = await bramWithTwo();
  for (const [paper, size] of [
    ["letter", [612, 792]],
    ["a4", [595.28, 841.89]],
  ] as const) {
    const pdf = await bram.printablePdf({ characterIds: [aldric.character.id], includeSkillText: false, paper });
    const doc = await PDFDocument.load(pdf.bytes);
    const { width, height } = doc.getPage(0).getSize();
    expect([Math.round(width), Math.round(height)], `the ${paper} page size in points`).toEqual(size.map(Math.round));
    expect(doc.getPageCount(), `pages in the ${paper} PDF`).toBe(pdf.pageCount);
  }
});

rule(
  { req: ["EX-2"], m: "M3" },
  "the PDF is a file named for the character and the date, ready to save to the phone",
  async () => {
    const { bram, aldric } = await bramWithTwo();
    const pdf = await bram.printablePdf({
      characterIds: [aldric.character.id],
      includeSkillText: false,
      paper: "letter",
    });
    expect(pdf.mimeType, "the file type").toBe("application/pdf");
    expect(pdf.fileName, "the file name").toMatch(/^Aldric.*2026-06-13.*\.pdf$/);
    expect(new TextDecoder().decode(pdf.bytes.slice(0, 5)), "the file's first bytes").toBe("%PDF-");
  },
);

rule({ req: ["EX-3"], m: "M3" }, "every page of the sheet shows when it was created", async () => {
  const { w, bram } = await bramWithTwo();
  const sheet = await bram.printableSheet({ characterIds: "all", includeSkillText: false, paper: "letter" });
  expect(sheet.createdAt, "when the sheet was created").toBe(w.clock.iso());
  expect(sheet.pageFooter, "the footer on every page").toMatch(/2026-06-13|13 June 2026|June 13, 2026|Jun 13, 2026/);
});

// ---------------------------------------------------------------- JSON export (EX-4)

rule(
  { req: ["EX-4"], m: "M3" },
  "the JSON export holds everything in the account, with its format version",
  async () => {
    const { bram, aldric } = await bramWithTwo();
    await bram.markUsed(aldric.entries.get("aldric-draught")!.id, { note: "raid" });
    const file = await bram.exportJson();
    expect(Object.keys(file).sort(), "the export's top-level fields").toEqual([
      "characters",
      "exportedAt",
      "formatVersion",
      "profile",
      "titles",
      "todo",
    ]);
    expect(file.formatVersion, "the format version").toBe(1);
    expect(file.profile, "the profile in the export").toEqual({ displayName: "Bramblewick" });
    expect(file.characters.map((c) => c.character.name).sort(), "characters in the export").toEqual([
      "Aldric",
      "Isolde",
    ]);
    const aldricOut = file.characters.find((c) => c.character.name === "Aldric")!;
    expect(aldricOut.entries.length, "Aldric's entries in the export").toBe(18);
    expect(
      aldricOut.history.some((r) => r.event === "used" && r.note === "raid"),
      "Aldric's used record",
    ).toBe(true);
    expect(
      file.titles.map((t) => t.name),
      "titles in the export",
    ).toEqual(["Friend of the Forest"]);
  },
);

rule(
  { req: ["EX-4", "GR-2"], m: "M4" },
  "the JSON export includes each entry's grants and the manual grants",
  async () => {
    const { bram, aldric } = await bramWithTwo({ full: true });
    await bram.addManualGrant(aldric.character.id, "DM ruling, Faire 2026", [{ kind: "cm", amount: 5 }]);
    const out = (await bram.exportJson()).characters.find((c) => c.character.name === "Aldric")!;
    const sword = out.entries.find((e) => e.category === "weapons" && e.name === "Duskfang");
    expect(
      sword && "grants" in sword && sword.grants?.map((g) => [g.kind, "amount" in g && g.amount]),
      "Duskfang's grants",
    ).toEqual([["cm", 15]]);
    expect(
      out.manualGrants.map((m) => m.reason),
      "Aldric's manual grants",
    ).toEqual(["DM ruling, Faire 2026"]);
  },
);

rule(
  { req: ["EX-4"], m: "M3" },
  "the JSON export's field names are fixed for every kind of record, so a rename can't slip through",
  async () => {
    const w = world();
    const bram = w.as("bram");
    await seedProfile(bram, "bram");
    const wren = await bram.createCharacter({ name: "Wren", className: "Rogue", level: 3, notes: "Made-up notes." });
    const id = wren.id;
    const common = { description: "Made-up text.", notes: "Made-up notes.", itemFamily: "Made-up Family" };
    const gain = { note: "From a made-up quest", source: "Quest", link: "https://discord.example.test/channels/1/2/3" };
    await bram.addEntry(
      id,
      {
        category: "weapons",
        name: "Wren's Blade",
        ...common,
        rarity: "epic",
        hands: 1,
        range: "melee",
        weaponGroup: "Sword",
        extraDamage: 1,
      },
      gain,
    );
    await bram.addEntry(id, { category: "armor", name: "Wren's Coat", ...common, rarity: "epic", slotKind: "chest" });
    await bram.addEntry(id, { category: "items", name: "Wren's Charm", ...common, rarity: "epic", arcane: true });
    await bram.addEntry(id, {
      category: "allies",
      name: "Wren's Cat",
      ...common,
      allyType: "familiar",
      hearts: 2,
      active: true,
    });
    const tonic = await bram.addEntry(id, { category: "consumables", name: "Wren's Tonic", ...common, quantity: 3 });
    const pebble = await bram.addEntry(id, {
      category: "components",
      name: "Wren's Pebble",
      ...common,
      quantity: 2,
      tier: "Dull",
    });
    await bram.addSkill(id, { skillId: "shadow-step", howGained: "starting", levelGained: 1, notes: "Made-up notes." });
    await bram.addTitle({ name: "Made-up Title", description: "Made-up text.", earned: "2026-06-01" });
    await bram.updateCharacter(id, { level: 4 });
    const used = await bram.markUsed(pebble.id, { note: "Made-up use" });
    await bram.restoreUsed(used.id);
    await bram.markTraded(tonic.id, { kind: "traded", quantity: 3, note: "To a made-up friend" });
    await bram.retireCharacter(id);

    const file = await bram.exportJson();
    const keys = (value: object | undefined) => Object.keys(value ?? {}).sort();
    const out = file.characters.find((c) => c.character.name === "Wren")!;
    expect(keys(out), "the fields of a character in the export").toEqual([
      "character",
      "entries",
      "equipped",
      "history",
      "manualGrants",
    ]);
    expect(keys(out.character), "Wren's fields").toEqual(["className", "id", "level", "name", "notes", "retired"]);
    expect(keys(file.profile), "the profile's fields").toEqual(["displayName"]);
    const base = ["category", "characterId", "description", "id", "itemFamily", "name", "notes", "quantity"];
    const entryFields: Record<string, string[]> = {
      weapons: [...base, "extraDamage", "hands", "range", "rarity", "weaponGroup"],
      armor: [...base, "rarity", "slotKind"],
      items: [...base, "arcane", "rarity"],
      allies: [...base, "active", "allyType", "hearts"],
      components: [...base, "tier"],
      skills: ["category", "characterId", "howGained", "id", "levelGained", "notes", "quantity", "skillId"],
    };
    for (const [category, fields] of Object.entries(entryFields)) {
      const entry = out.entries.find((e) => e.category === category);
      expect(keys(entry), `the fields of Wren's ${category} entry`).toEqual(fields.sort());
    }
    expect(keys(file.titles.find((t) => t.name === "Made-up Title")), "a title's fields").toEqual([
      "description",
      "earned",
      "id",
      "name",
      "scope",
    ]);
    const record = (event: string, entryName?: string) =>
      out.history.find((r) => r.event === event && (entryName === undefined || r.entryName === entryName));
    const about = ["category", "entryId", "entryName"];
    const recordBase = ["characterId", "date", "enteredAt", "event", "id", "summary"];
    expect(keys(record("acquired", "Wren's Blade")), "an acquired record's fields").toEqual(
      [...recordBase, ...about, "link", "note", "quantity", "source"].sort(),
    );
    expect(keys(record("used")), "a used record's fields").toEqual(
      [...recordBase, ...about, "note", "quantity"].sort(),
    );
    expect(keys(record("restored")), "a restored record's fields").toEqual(
      [...recordBase, ...about, "quantity", "restores"].sort(),
    );
    expect(keys(record("traded")), "a traded record's fields").toEqual(
      [...recordBase, ...about, "note", "quantity", "snapshot"].sort(),
    );
    expect(keys(record("traded")?.snapshot), "a traded record's snapshot fields").toEqual([
      "category",
      "description",
      "itemFamily",
      "name",
      "notes",
      "quantity",
    ]);
    expect(keys(record("level-changed")), "a level change's fields").toEqual([...recordBase, "change"].sort());
    expect(keys(record("level-changed")?.change), "a level change's change fields").toEqual(["from", "to"]);
  },
);

rule({ req: ["EX-4", "PV-1"], m: "M3" }, "the export never includes another user's records", async () => {
  const { w, bram } = await bramWithTwo();
  const cass = w.as("cass");
  await seedProfile(cass, "cass");
  await seedCharacter(cass, "brin");
  const text = JSON.stringify(await bram.exportJson());
  for (const other of ["Brin", "Thornneedle", "Cassia Vane", "cass@example.test"]) {
    expect(text, `Bram's export mentioning ${other}`).not.toContain(other);
  }
});
