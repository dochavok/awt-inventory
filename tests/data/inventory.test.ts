// Inventory entries (section 5: IN-1 to IN-16), through the data layer. Skills
// are in tests/data/skills.test.ts; what entries grant, in grants.test.ts.

import { expect } from "vitest";
import { NotFoundError, ValidationError } from "../../src/errors";
import { rule } from "../support/rule";
import { seedCharacter, seedProfile, world } from "../support/world";

async function bramWithAldric(options: { full?: boolean } = {}) {
  const w = world();
  const bram = w.as("bram");
  await seedProfile(bram, "bram");
  const aldric = await seedCharacter(bram, "aldric", options);
  const id = (fixtureId: string) => aldric.entries.get(fixtureId)!.id;
  return { w, bram, aldric, characterId: aldric.character.id, id };
}

// ---------------------------------------------------------------- fields (IN-1 to IN-7)

rule(
  { req: ["IN-1"], m: "M2" },
  "an entry has a name, a quantity (1 unless given), a description and notes",
  async () => {
    const { bram, characterId } = await bramWithAldric();
    const potion = await bram.addEntry(characterId, {
      category: "consumables",
      name: "Ember Tonic",
      description: "Made-up card text.",
      notes: "Bought at the made-up stall",
    });
    expect(await bram.entry(potion.id), "Ember Tonic as stored").toMatchObject({
      name: "Ember Tonic",
      quantity: 1,
      description: "Made-up card text.",
      notes: "Bought at the made-up stall",
    });
  },
);

rule({ req: ["IN-1"], m: "M2" }, "a name is required and a quantity must be a whole number of at least 1", async () => {
  const { bram, characterId } = await bramWithAldric();
  const blank = bram.addEntry(characterId, { category: "consumables", name: " " });
  await expect(blank, "an entry with a blank name").rejects.toMatchObject({ field: "name" });
  for (const quantity of [0, -2, 1.5]) {
    const attempt = bram.addEntry(characterId, { category: "consumables", name: "Ember Tonic", quantity });
    await expect(attempt, `quantity ${quantity}`).rejects.toThrow(ValidationError);
    await expect(attempt, `quantity ${quantity}`).rejects.toMatchObject({ field: "quantity" });
  }
});

rule(
  { req: ["IN-2", "RD-3"], m: "M2" },
  "a rarity must be one from the reference data that isn't retired",
  async () => {
    const { bram, characterId } = await bramWithAldric();
    const ok = await bram.addEntry(characterId, {
      category: "items",
      name: "Sun Charm",
      arcane: true,
      rarity: "cursed",
    });
    expect(await bram.entry(ok.id), "Sun Charm as stored").toMatchObject({ rarity: "cursed" });
    for (const rarity of ["made-up-rarity", "ancient"]) {
      const attempt = bram.addEntry(characterId, { category: "items", name: "Odd Charm", arcane: true, rarity });
      await expect(attempt, `rarity ${rarity}`).rejects.toMatchObject({ field: "rarity" });
    }
  },
);

rule({ req: ["IN-2"], m: "M2" }, "only weapons, armor and items can have a rarity", async () => {
  const { bram, characterId } = await bramWithAldric();
  const attempt = bram.addEntry(characterId, { category: "consumables", name: "Rare Tonic", rarity: "epic" } as never);
  await expect(attempt, "a consumable with a rarity").rejects.toMatchObject({ field: "rarity" });
});

rule(
  { req: ["IN-2"], m: "M2" },
  "item family suggestions are the user's earlier families and the common ones, not retired ones",
  async () => {
    const { bram, characterId } = await bramWithAldric();
    await bram.addEntry(characterId, { category: "allies", name: "Pip", active: false, itemFamily: "Hedge-born" });
    const suggestions = await bram.suggestions("itemFamily");
    expect([...suggestions].sort(), "item family suggestions").toEqual(["Emberforged", "Hedge-born", "Moonwoven"]);
  },
);

rule({ req: ["IN-2"], m: "M2" }, "any family can be typed, not only a suggested one", async () => {
  const { bram, characterId } = await bramWithAldric();
  const pip = await bram.addEntry(characterId, {
    category: "components",
    name: "Odd Twig",
    itemFamily: "Never Heard Of",
  });
  expect(pip.itemFamily, "Odd Twig's family").toBe("Never Heard Of");
});

rule({ req: ["IN-2", "PV-1"], m: "M2" }, "suggestions never include another user's typed values", async () => {
  const { w, bram } = await bramWithAldric();
  const cass = w.as("cass");
  await seedProfile(cass, "cass");
  const brin = await seedCharacter(cass, "brin");
  await cass.addEntry(brin.character.id, {
    category: "items",
    name: "Secret Thing",
    arcane: false,
    itemFamily: "Cass Only",
  });
  expect(await bram.suggestions("itemFamily"), "Bram's item family suggestions").not.toContain("Cass Only");
});

rule({ req: ["IN-3"], m: "M2" }, "a weapon keeps its hands, range, weapon group and extra damage", async () => {
  const { bram, characterId } = await bramWithAldric();
  const bow = await bram.addEntry(characterId, {
    category: "weapons",
    name: "Hunting Bow",
    hands: 2,
    range: "ranged",
    weaponGroup: "Bow",
    extraDamage: 1,
  });
  expect(await bram.entry(bow.id), "Hunting Bow as stored").toMatchObject({
    hands: 2,
    range: "ranged",
    weaponGroup: "Bow",
    extraDamage: 1,
  });
  expect((await bram.suggestions("weaponGroup")).sort(), "weapon group suggestions").toEqual(["Bow", "Sword"]);
});

rule({ req: ["IN-4"], m: "M2" }, "armor's slot kind must be one from the reference data", async () => {
  const { bram, characterId } = await bramWithAldric();
  const shield = await bram.addEntry(characterId, { category: "armor", name: "Oak Shield", slotKind: "off-hand" });
  expect(shield.category === "armor" && shield.slotKind, "the shield's slot").toBe("off-hand");
  const attempt = bram.addEntry(characterId, { category: "armor", name: "Odd Plate", slotKind: "made-up-slot" });
  await expect(attempt, "armor for an unknown slot kind").rejects.toMatchObject({ field: "slotKind" });
});

rule({ req: ["IN-5"], m: "M2" }, "an item is arcane or not, and never has a paper-doll slot", async () => {
  const { bram, characterId } = await bramWithAldric();
  const charm = await bram.addEntry(characterId, { category: "items", name: "Owl Charm", arcane: true });
  expect(charm.category === "items" && charm.arcane, "Owl Charm is arcane").toBe(true);
  const attempt = bram.addEntry(characterId, {
    category: "items",
    name: "Odd Ring",
    arcane: false,
    slotKind: "ring-left",
  } as never);
  await expect(attempt, "an item with a paper-doll slot").rejects.toMatchObject({ field: "slotKind" });
});

rule({ req: ["IN-6"], m: "M2" }, "an ally keeps its type, its own hearts, and whether it's active", async () => {
  const { bram, characterId } = await bramWithAldric();
  const pip = await bram.addEntry(characterId, {
    category: "allies",
    name: "Pip",
    allyType: "sprite",
    hearts: 2,
    active: true,
  });
  expect(await bram.entry(pip.id), "Pip as stored").toMatchObject({ allyType: "sprite", hearts: 2, active: true });
  await bram.setActive(pip.id, false);
  expect(await bram.entry(pip.id), "Pip after making it inactive").toMatchObject({ active: false });
  expect((await bram.suggestions("allyType")).sort(), "ally type suggestions").toEqual(["ally", "familiar", "sprite"]);
});

rule(
  { req: ["IN-7"], m: "M2" },
  "component tier suggestions are the user's earlier tiers and the common ones",
  async () => {
    const { bram, characterId } = await bramWithAldric();
    await bram.addEntry(characterId, { category: "components", name: "Odd Moss", tier: "Homemade" });
    expect((await bram.suggestions("componentTier")).sort(), "component tier suggestions").toEqual([
      "Bright",
      "Faint",
      "Homemade",
      "Radiant",
    ]);
  },
);

// ---------------------------------------------------------------- editing and lists (IN-8, IN-9)

rule(
  { req: ["IN-8", "HI-2"], m: "M2" },
  "any field can be edited, and edits other than quantity aren't recorded",
  async () => {
    const { bram, characterId, id } = await bramWithAldric();
    const before = (await bram.history(characterId)).length;
    await bram.updateEntry(id("aldric-sword"), { name: "Duskfang Reforged", notes: "New notes", weaponGroup: "Blade" });
    expect(await bram.entry(id("aldric-sword")), "Duskfang after editing").toMatchObject({
      name: "Duskfang Reforged",
      notes: "New notes",
      weaponGroup: "Blade",
    });
    expect((await bram.history(characterId)).length, "number of history records after the edit").toBe(before);
  },
);

rule(
  { req: ["IN-8"], m: "M2" },
  "a field left undefined in an edit is unchanged, and empty text clears an optional one",
  async () => {
    const { bram, id } = await bramWithAldric();
    await bram.updateEntry(id("aldric-draught"), { notes: "Keep me" });
    await bram.updateEntry(id("aldric-draught"), { name: "Greater Draught", quantity: undefined, notes: undefined });
    expect(await bram.entry(id("aldric-draught")), "the draught after an edit leaving fields undefined").toMatchObject({
      name: "Greater Draught",
      quantity: 3,
      notes: "Keep me",
    });
    await bram.updateEntry(id("aldric-draught"), { notes: "" });
    expect((await bram.entry(id("aldric-draught"))).notes, "the notes after clearing them").toBeUndefined();
  },
);

rule(
  { req: ["IN-13", "HI-3"], m: "M2" },
  "a restore sits next to the use it undoes, even when the use was dated earlier",
  async () => {
    const { w, bram, characterId, id } = await bramWithAldric();
    w.clock.set("2026-06-15T02:30:00.000Z");
    const used = await bram.markUsed(id("aldric-draught"), { date: "2026-06-13T19:00:00.000Z" });
    w.clock.advanceSeconds(60);
    await bram.markUsed(id("aldric-shard"));
    const restored = await bram.restoreUsed(used.id);
    expect(restored.date, "the restore's date").toBe("2026-06-13T19:00:00.000Z");
    const order = (await bram.history(characterId)).map((r) => r.id);
    expect(order.indexOf(used.id) - order.indexOf(restored.id), "places between the restore and the use").toBe(1);
  },
);

rule({ req: ["IN-13", "NF-6"], m: "M2" }, "a restore can't take a quantity past its maximum", async () => {
  const { bram, id } = await bramWithAldric();
  const used = await bram.markUsed(id("aldric-draught"));
  await bram.updateEntry(id("aldric-draught"), { quantity: 9999 });
  await expect(bram.restoreUsed(used.id), "restoring a draught onto 9,999").rejects.toMatchObject({
    field: "quantity",
  });
  expect((await bram.entry(id("aldric-draught"))).quantity, "Healing Draughts").toBe(9999);
});

rule({ req: ["IN-14"], m: "M2" }, "an active ally is made inactive when part of it is given away", async () => {
  const { bram, characterId } = await bramWithAldric();
  const hounds = await bram.addEntry(characterId, {
    category: "allies",
    name: "Ash Hounds",
    active: true,
    quantity: 2,
  });
  await bram.markTraded(hounds.id, { kind: "given-away", quantity: 1 });
  const item = (await bram.listEntries(characterId, "allies")).find((a) => a.entry.id === hounds.id);
  expect(item?.entry.quantity, "Ash Hounds left").toBe(1);
  expect(item?.equipped, "Ash Hounds still active").toBe(false);
});

rule({ req: ["IN-9"], m: "M2" }, "a category lists its entries alphabetically, with active allies marked", async () => {
  const { bram, characterId } = await bramWithAldric();
  await bram.addEntry(characterId, { category: "allies", name: "Ash Hound", active: false });
  const allies = await bram.listEntries(characterId, "allies");
  expect(
    allies.map((a) => [a.entry.category !== "skills" && a.entry.name, a.equipped]),
    "Aldric's allies, in order, with active marked",
  ).toEqual([
    ["Ash Hound", false],
    ["Grey Fang", true],
    ["Old Mule", false],
  ]);
});

rule({ req: ["IN-9", "EQ-1"], m: "M4" }, "the armor list marks what's equipped", async () => {
  const { bram, characterId } = await bramWithAldric({ full: true });
  const armor = await bram.listEntries(characterId, "armor");
  expect(
    armor.map((a) => [a.entry.category !== "skills" && a.entry.name, a.equipped]),
    "Aldric's armor, in order, with equipped marked",
  ).toEqual([
    ["Ember Gauntlets", true],
    ["Hawkeye Helm", true],
    ["Ironclad Plate", true],
    ["Spare Cloak", false],
    ["Stridewalk Boots", true],
  ]);
});

// ---------------------------------------------------------------- gaining (IN-10, IN-11)

rule({ req: ["IN-10", "HI-1"], m: "M2" }, "adding an entry is recorded as acquired, with its quantity", async () => {
  const { w, bram, characterId } = await bramWithAldric();
  const tonic = await bram.addEntry(characterId, { category: "consumables", name: "Ember Tonic", quantity: 3 });
  const [latest] = await bram.history(characterId);
  expect(latest, "Aldric's newest history record").toMatchObject({
    event: "acquired",
    entryId: tonic.id,
    entryName: "Ember Tonic",
    category: "consumables",
    quantity: 3,
    date: w.clock.iso(),
  });
});

rule({ req: ["IN-10"], m: "M2" }, "raising a quantity from 3 to 5 is recorded as acquired 2", async () => {
  const { bram, characterId, id } = await bramWithAldric();
  await bram.updateEntry(id("aldric-draught"), { quantity: 5 });
  const [latest] = await bram.history(characterId);
  expect(latest, "the record of buying 2 more").toMatchObject({
    event: "acquired",
    entryId: id("aldric-draught"),
    quantity: 2,
  });
  expect((await bram.entry(id("aldric-draught"))).quantity, "Healing Draughts").toBe(5);
});

rule(
  { req: ["IN-11"], m: "M3" },
  "a gain can record where it came from and a link, kept with the history record",
  async () => {
    const { bram, characterId } = await bramWithAldric();
    await bram.addEntry(
      characterId,
      { category: "items", name: "Owl Charm", arcane: true },
      { source: "DM award", link: "https://discord.example.test/channels/1/2/3" },
    );
    const [latest] = await bram.history(characterId);
    expect(latest, "the acquired record").toMatchObject({
      event: "acquired",
      source: "DM award",
      link: "https://discord.example.test/channels/1/2/3",
    });
    expect((await bram.suggestions("acquisitionSource")).sort(), "acquisition source suggestions").toEqual([
      "DM award",
      "Quest",
      "Trade",
      "Vendor",
    ]);
  },
);

rule(
  { req: ["IN-11"], m: "M3" },
  "a gain's link must be a web address starting http:// or https://; anything else is refused, naming the link",
  async () => {
    const { bram, characterId } = await bramWithAldric();
    for (const link of [
      "mailto:bram@example.test",
      "ftp://files.example.test/charm",
      "javascript:void(0)",
      "data:text/plain,charm",
      "discord.example.test/channels/1/2/3",
      "https://",
    ]) {
      const attempt = bram.addEntry(characterId, { category: "items", name: "Owl Charm", arcane: true }, { link });
      await expect(attempt, `a gain with the link ${link}`).rejects.toThrow(ValidationError);
      await expect(attempt, `a gain with the link ${link}`).rejects.toMatchObject({ field: "link" });
    }
    expect(
      (await bram.listEntries(characterId, "items")).filter(
        (e) => e.entry.category === "items" && e.entry.name === "Owl Charm",
      ),
      "Aldric's Owl Charms after the refused gains",
    ).toEqual([]);
    await bram.addEntry(
      characterId,
      { category: "items", name: "Owl Charm", arcane: true },
      { link: "HTTPS://discord.example.test/channels/1/2/3" },
    );
    const [latest] = await bram.history(characterId);
    expect(latest, "the acquired record with a capitalised https link").toMatchObject({
      event: "acquired",
      entryName: "Owl Charm",
      link: "HTTPS://discord.example.test/channels/1/2/3",
    });
  },
);

// ---------------------------------------------------------------- used and restored (IN-12, IN-13)

rule(
  { req: ["IN-12"], m: "M2" },
  "marking a Healing Draught used leaves 2 of 3, and records it with the note",
  async () => {
    const { bram, characterId, id } = await bramWithAldric();
    const record = await bram.markUsed(id("aldric-draught"), { note: "Saturday's raid" });
    expect((await bram.entry(id("aldric-draught"))).quantity, "Healing Draughts left").toBe(2);
    expect(record, "the used record").toMatchObject({
      event: "used",
      entryId: id("aldric-draught"),
      quantity: 1,
      note: "Saturday's raid",
    });
    expect((await bram.history(characterId))[0]?.id, "the newest record").toBe(record.id);
  },
);

rule(
  { req: ["IN-12", "IN-16"], m: "M2" },
  "using the last one takes the entry off the list but keeps it in the history",
  async () => {
    const { bram, characterId } = await bramWithAldric();
    const tonic = await bram.addEntry(characterId, { category: "consumables", name: "Ember Tonic" });
    const record = await bram.markUsed(tonic.id);
    const names = (await bram.listEntries(characterId, "consumables")).map(
      (e) => e.entry.category !== "skills" && e.entry.name,
    );
    expect(names, "Aldric's consumables").toEqual(["Healing Draught"]);
    expect(record.snapshot, "the snapshot kept for the used-up Ember Tonic").toMatchObject({
      name: "Ember Tonic",
      category: "consumables",
      quantity: 1,
    });
  },
);

rule({ req: ["IN-12"], m: "M2" }, "a component can be used, but a weapon can't", async () => {
  const { bram, id } = await bramWithAldric();
  await bram.markUsed(id("aldric-shard"));
  expect((await bram.entry(id("aldric-shard"))).quantity, "Ember Shards left").toBe(1);
  const attempt = bram.markUsed(id("aldric-sword"));
  await expect(attempt, "marking Duskfang used").rejects.toThrow(ValidationError);
  await expect(attempt, "marking Duskfang used").rejects.toThrow(/Duskfang/);
});

rule(
  { req: ["IN-13"], m: "M2" },
  "restoring a used record puts the draught back, recorded next to the original",
  async () => {
    const { bram, characterId, id } = await bramWithAldric();
    const used = await bram.markUsed(id("aldric-draught"));
    const restored = await bram.restoreUsed(used.id);
    expect((await bram.entry(id("aldric-draught"))).quantity, "Healing Draughts after restoring").toBe(3);
    expect(restored, "the restored record").toMatchObject({ event: "restored", restores: used.id, quantity: 1 });
    const events = (await bram.history(characterId)).slice(0, 2).map((r) => r.event);
    expect(events, "the two newest records").toEqual(["restored", "used"]);
  },
);

rule({ req: ["IN-13"], m: "M2" }, "restoring the last one used brings the entry back", async () => {
  const { bram, characterId } = await bramWithAldric();
  const tonic = await bram.addEntry(characterId, { category: "consumables", name: "Ember Tonic" });
  const used = await bram.markUsed(tonic.id);
  await bram.restoreUsed(used.id);
  const list = (await bram.listEntries(characterId, "consumables")).map((e) => [
    e.entry.category !== "skills" && e.entry.name,
    e.entry.quantity,
  ]);
  expect(list, "Aldric's consumables").toEqual([
    ["Ember Tonic", 1],
    ["Healing Draught", 3],
  ]);
});

rule(
  { req: ["IN-13"], m: "M2" },
  "a used record can be restored once only, and only a used record can be restored",
  async () => {
    const { bram, characterId, id } = await bramWithAldric();
    const used = await bram.markUsed(id("aldric-draught"));
    await bram.restoreUsed(used.id);
    await expect(bram.restoreUsed(used.id), "restoring it a second time").rejects.toThrow(ValidationError);
    const acquired = (await bram.history(characterId)).find((r) => r.event === "acquired")!;
    await expect(bram.restoreUsed(acquired.id), "restoring an acquired record").rejects.toThrow(ValidationError);
    expect((await bram.entry(id("aldric-draught"))).quantity, "Healing Draughts").toBe(3);
  },
);

// ---------------------------------------------------------------- traded, given away, deleted (IN-14 to IN-16)

rule(
  { req: ["IN-14", "IN-16"], m: "M2" },
  "trading all of an entry removes it and keeps a snapshot, with who to",
  async () => {
    const { bram, characterId, id } = await bramWithAldric();
    const record = await bram.markTraded(id("aldric-lantern"), { kind: "traded", note: "to Pell (made up)" });
    await expect(bram.entry(id("aldric-lantern")), "reading the traded lantern").rejects.toThrow(NotFoundError);
    expect(record, "the traded record").toMatchObject({
      event: "traded",
      quantity: 1,
      note: "to Pell (made up)",
      snapshot: { name: "Hooded Lantern", category: "items", quantity: 1 },
    });
    expect((await bram.history(characterId))[0]?.snapshot?.name, "the newest record's snapshot").toBe("Hooded Lantern");
  },
);

rule({ req: ["IN-14"], m: "M2" }, "giving away part of a quantity leaves the rest", async () => {
  const { bram, id } = await bramWithAldric();
  const record = await bram.markTraded(id("aldric-draught"), { kind: "given-away", quantity: 2 });
  expect(record, "the given-away record").toMatchObject({ event: "given-away", quantity: 2 });
  expect((await bram.entry(id("aldric-draught"))).quantity, "Healing Draughts left").toBe(1);
});

rule({ req: ["IN-14"], m: "M2" }, "trading more than the quantity is refused", async () => {
  const { bram, id } = await bramWithAldric();
  const attempt = bram.markTraded(id("aldric-draught"), { kind: "traded", quantity: 4 });
  await expect(attempt, "trading 4 of 3").rejects.toMatchObject({ field: "quantity" });
  expect((await bram.entry(id("aldric-draught"))).quantity, "Healing Draughts").toBe(3);
});

rule(
  { req: ["IN-13", "IN-14"], m: "M2" },
  "a draught marked used by mistake can be restored after the rest were given away",
  async () => {
    const { bram, characterId, id } = await bramWithAldric();
    const used = await bram.markUsed(id("aldric-draught"));
    await bram.markTraded(id("aldric-draught"), { kind: "given-away" });
    await expect(bram.entry(id("aldric-draught")), "reading the draught once all are gone").rejects.toThrow(
      NotFoundError,
    );
    await bram.restoreUsed(used.id);
    expect((await bram.entry(id("aldric-draught"))).quantity, "Healing Draughts after restoring").toBe(1);
    const consumables = (await bram.listEntries(characterId, "consumables")).map((e) => [
      e.entry.category !== "skills" && e.entry.name,
      e.entry.quantity,
    ]);
    expect(consumables, "Aldric's consumables").toEqual([["Healing Draught", 1]]);
  },
);

rule({ req: ["IN-14", "EQ-4"], m: "M4" }, "trading an equipped entry unequips it first", async () => {
  const { bram, characterId, id } = await bramWithAldric({ full: true });
  await bram.markTraded(id("aldric-helm"), { kind: "traded" });
  const head = (await bram.sheet(characterId)).equipped.filter((q) => q.slot === "head");
  expect(head, "what's in Aldric's Head slot").toEqual([]);
  expect((await bram.alerts(characterId)).length, "Aldric's alerts").toBe(0);
});

rule(
  { req: ["IN-16"], m: "M2" },
  "a snapshot keeps the description, notes, rarity and family as they were",
  async () => {
    const { bram, characterId } = await bramWithAldric();
    const charm = await bram.addEntry(characterId, {
      category: "items",
      name: "Owl Charm",
      arcane: true,
      rarity: "epic",
      itemFamily: "Moonwoven",
      description: "Made-up text.",
      notes: "My note",
    });
    const record = await bram.markTraded(charm.id, { kind: "given-away" });
    expect(record.snapshot, "Owl Charm's snapshot").toEqual({
      name: "Owl Charm",
      category: "items",
      description: "Made-up text.",
      notes: "My note",
      rarity: "epic",
      itemFamily: "Moonwoven",
      quantity: 1,
    });
  },
);

rule(
  { req: ["IN-15", "HI-4"], m: "M2" },
  "a hard delete leaves no trace: the entry and its history records go",
  async () => {
    const { bram, characterId } = await bramWithAldric();
    const tonic = await bram.addEntry(characterId, { category: "consumables", name: "Ember Tonic", quantity: 2 });
    await bram.markUsed(tonic.id);
    await bram.deleteEntry(tonic.id);
    await expect(bram.entry(tonic.id), "reading the deleted tonic").rejects.toThrow(NotFoundError);
    const mentions = (await bram.history(characterId)).filter(
      (r) => r.entryId === tonic.id || r.entryName === "Ember Tonic",
    );
    expect(mentions, "history records about the deleted tonic").toEqual([]);
    expect(
      (await bram.history(characterId)).some((r) => r.entryName === "Duskfang"),
      "Duskfang's record, still there",
    ).toBe(true);
  },
);

rule({ req: ["IN-15"], m: "M2" }, "Undo within 10 seconds brings a deleted entry back with its history", async () => {
  const { w, bram, characterId, id } = await bramWithAldric();
  const before = await bram.history(characterId);
  const { undo } = await bram.deleteEntry(id("aldric-draught"));
  w.clock.advanceSeconds(9);
  await undo();
  expect((await bram.entry(id("aldric-draught"))).quantity, "Healing Draughts after Undo").toBe(3);
  expect(await bram.history(characterId), "Aldric's history after Undo").toEqual(before);
});

rule({ req: ["IN-15"], m: "M2" }, "after about 10 seconds, Undo no longer works", async () => {
  const { w, bram, id } = await bramWithAldric();
  const { undo } = await bram.deleteEntry(id("aldric-draught"));
  w.clock.advanceSeconds(15);
  await expect(undo(), "Undo after 15 seconds").rejects.toThrow(ValidationError);
  await expect(bram.entry(id("aldric-draught")), "reading the deleted draught").rejects.toThrow(NotFoundError);
});
