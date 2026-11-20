// Grants through the data layer (GR-2, GR-5, TI-4, TI-5): which sources can
// carry them, and that totals follow every change at once.
// Also equipping through the store (EQ-2, EQ-4, EQ-8) and the checks on each grant (GR-1).
// The methods that do a page's work in fewer reads (TF-2, NF-5) give the same answers as
// the ones they replace.

import { expect } from "vitest";
import { NotFoundError, ValidationError } from "../../src/errors";
import { rule } from "../support/rule";
import { seedCharacter, seedProfile, world } from "../support/world";

async function bramWithAldric() {
  const w = world();
  const bram = w.as("bram");
  await seedProfile(bram, "bram");
  const aldric = await seedCharacter(bram, "aldric", { full: true });
  const id = (fixtureId: string) => aldric.entries.get(fixtureId)!.id;
  return { w, bram, aldric, id };
}

rule(
  { req: ["GR-2", "GR-1"], m: "M4" },
  "grants can be added to a weapon, armor, an item, an ally and a title",
  async () => {
    const { bram, aldric, id } = await bramWithAldric();
    await bram.addGrant({ entryId: id("aldric-sword") }, { kind: "cm", amount: 1 });
    await bram.addGrant({ entryId: id("aldric-helm") }, { kind: "cm", amount: 1 });
    await bram.addGrant({ entryId: id("aldric-charm") }, { kind: "cm", amount: 1 });
    await bram.addGrant({ entryId: id("aldric-wolf") }, { kind: "cm", amount: 1 });
    const title = (await bram.listTitles()).find((t) => t.name === "Friend of the Forest")!;
    await bram.addGrant({ titleId: title.id }, { kind: "cm", amount: 1 });
    const cm = (await bram.totals(aldric.character.id)).cm;
    expect(cm.value, "Aldric's CM after five +1 grants").toBe(175);
    expect(
      cm.lines.map((l) => [l.group, l.value]),
      "Aldric's CM lines after a +1 in each of Weapons, Armor, Items, Ally and Titles",
    ).toEqual([
      ["class-bonus", 63],
      ["armor", 72],
      ["weapons", 16],
      ["skills", 11],
      ["ally", 11],
      ["items", 1],
      ["titles", 1],
    ]);
  },
);

rule(
  { req: ["GR-2"], m: "M4" },
  "a consumable, a component or a skill can't be given grants, and the refusal says why",
  async () => {
    const { bram, id } = await bramWithAldric();
    for (const [fixtureId, category] of [
      ["aldric-draught", "Consumables"],
      ["aldric-shard", "Components"],
      ["aldric-sk-guard", "Skills"],
    ] as const) {
      const attempt = bram.addGrant({ entryId: id(fixtureId) }, { kind: "cm", amount: 2 });
      await expect(attempt, `a grant on ${fixtureId}`).rejects.toThrow(ValidationError);
      await expect(attempt, `the refusal for ${fixtureId}`).rejects.toMatchObject({ field: "grants" });
      await expect(attempt, `the refusal for ${fixtureId}`).rejects.toThrow(new RegExp(category, "i"));
    }
  },
);

rule(
  { req: ["GR-2"], m: "M4" },
  "a manual grant carries its reason, and one source can have several grants",
  async () => {
    const { bram, aldric } = await bramWithAldric();
    const manual = await bram.addManualGrant(aldric.character.id, "DM ruling, Faire 2026", [
      { kind: "cm", amount: 3 },
      { kind: "mitigation", amount: 1 },
    ]);
    expect(manual.reason, "the manual grant's reason").toBe("DM ruling, Faire 2026");
    expect(
      manual.grants.map((g) => g.kind),
      "the manual grant's grants",
    ).toEqual(["cm", "mitigation"]);
    const totals = await bram.totals(aldric.character.id);
    const other = totals.cm.grants.filter((g) => g.source.type === "manual");
    expect(
      other.map((g) => [g.source.type === "manual" && g.source.reason, g.amount]),
      "manual lines in Aldric's CM",
    ).toEqual([["DM ruling, Faire 2026", 3]]);
    expect(totals.mitigation.value, "Aldric's mitigation with the manual +1").toBe(4);
  },
);

rule(
  { req: ["GR-5", "IN-14"], m: "M4" },
  "trading Duskfang removes its +15 at once: Aldric's CM goes from 170 to 155",
  async () => {
    const { bram, aldric, id } = await bramWithAldric();
    expect((await bram.totals(aldric.character.id)).cm.value, "Aldric's CM before").toBe(170);
    await bram.markTraded(id("aldric-sword"), { kind: "traded", note: "to a made-up player" });
    expect((await bram.totals(aldric.character.id)).cm.value, "Aldric's CM after trading Duskfang").toBe(155);
  },
);

rule({ req: ["GR-5", "EQ-4"], m: "M4" }, "unequipping and deleting sources change the totals at once", async () => {
  const { bram, aldric, id } = await bramWithAldric();
  await bram.unequip(id("aldric-helm"));
  expect((await bram.totals(aldric.character.id)).cm.value, "Aldric's CM without Hawkeye Helm").toBe(155);
  await bram.deleteEntry(id("aldric-plate"));
  const totals = await bram.totals(aldric.character.id);
  expect(totals.cm.value, "Aldric's CM after deleting Ironclad Plate").toBe(125);
  expect(totals.mitigation.value, "Aldric's mitigation after deleting Ironclad Plate").toBe(2);
});

rule(
  { req: ["GR-5"], m: "M4" },
  "changing a grant's amount changes the total; nothing keeps the old number",
  async () => {
    const { bram, aldric, id } = await bramWithAldric();
    const sword = await bram.entry(id("aldric-sword"));
    const grant = sword.category === "weapons" ? sword.grants![0]! : undefined;
    await bram.removeGrant(grant!.id);
    await bram.addGrant({ entryId: id("aldric-sword") }, { kind: "cm", amount: 20 });
    expect((await bram.totals(aldric.character.id)).cm.value, "Aldric's CM with Duskfang at +20").toBe(175);
  },
);

rule(
  { req: ["TI-5", "GR-3"], q: ["Q12"], m: "M4" },
  "a player-level title's grant applies to all of Bram's characters, including new ones",
  async () => {
    const { bram, aldric } = await bramWithAldric();
    const isolde = await seedCharacter(bram, "isolde", { full: true });
    await bram.addTitle({ name: "Champion of the Lists", grants: [{ kind: "cm", amount: 2 }] });
    const wren = await bram.createCharacter({ name: "Wren", className: "Rogue", level: 3 });
    for (const [name, id, cm] of [
      ["Aldric", aldric.character.id, 172],
      ["Isolde", isolde.character.id, 23],
    ] as const) {
      expect((await bram.totals(id)).cm.value, `${name}'s CM with the title`).toBe(cm);
    }
    const wrenTitles = (await bram.totals(wren.id)).cm.lines.find((l) => l.group === "titles");
    expect(wrenTitles?.value, "Wren's Titles line, created after the title").toBe(2);
  },
);

rule(
  { req: ["TI-5", "TI-2"], q: ["Q12"], m: "M4" },
  "a title switched to character-level for Isolde stops counting for Aldric",
  async () => {
    const { bram, aldric } = await bramWithAldric();
    const isolde = await seedCharacter(bram, "isolde", { full: true });
    const title = await bram.addTitle({ name: "Champion of the Lists", grants: [{ kind: "cm", amount: 2 }] });
    await bram.setTitleScope(title.id, { level: "character", characterId: isolde.character.id });
    expect((await bram.totals(aldric.character.id)).cm.value, "Aldric's CM without the title").toBe(170);
    expect((await bram.totals(isolde.character.id)).cm.value, "Isolde's CM with the title").toBe(23);
  },
);

rule({ req: ["EQ-2"], m: "M4" }, "a blocked equip changes nothing, and says what's in the way", async () => {
  const { bram, aldric } = await bramWithAldric();
  const mail = await bram.addEntry(aldric.character.id, { category: "armor", name: "Chain Shirt", slotKind: "chest" });
  const before = (await bram.sheet(aldric.character.id)).equipped;
  const result = await bram.equip(mail.id, "chest");
  expect([result.outcome, result.block?.reason], "equipping a second chest piece").toEqual(["blocked", "slot-full"]);
  expect(result.block?.message, "the block message").toContain("Ironclad Plate");
  expect((await bram.sheet(aldric.character.id)).equipped, "what Aldric has equipped afterwards").toEqual(before);
});

rule(
  { req: ["IN-8", "GR-5", "EQ-4"], m: "M4" },
  "editing an equipped entry keeps its grants and where it's equipped",
  async () => {
    const { bram, aldric, id } = await bramWithAldric();
    await bram.updateEntry(id("aldric-sword"), { notes: "Freshly sharpened", name: "Duskfang the Keen" });
    const sheet = await bram.sheet(aldric.character.id);
    expect(sheet.equipped.find((q) => q.entryId === id("aldric-sword"))?.slot, "where Duskfang is after the edit").toBe(
      "main-hand",
    );
    expect((await bram.totals(aldric.character.id)).cm.value, "Aldric's CM after editing Duskfang").toBe(170);
  },
);

rule(
  { req: ["GR-1", "GR-2"], m: "M4" },
  "a grant that isn't one of the kinds, or has a bad amount, die, slot kind or rarity, is refused, naming the grant",
  async () => {
    const { bram, id } = await bramWithAldric();
    const sword = { entryId: id("aldric-sword") };
    for (const [what, grant] of [
      ["a made-up kind", { kind: "xp", amount: 3 }],
      ["a kind named like a built-in", { kind: "toString", amount: 3 }],
      ["CM +0", { kind: "cm", amount: 0 }],
      ["CM +1.5", { kind: "cm", amount: 1.5 }],
      ["a die that isn't dice", { kind: "die", die: "lots" }],
      ["a slot kind not in the reference data", { kind: "slots", slotKind: "wings", amount: 1 }],
      ["a retired slot kind", { kind: "slots", slotKind: "cape", amount: 1 }],
      ["a rarity not in the reference data", { kind: "allowance", rarity: "shiny", amount: 1 }],
      ["a made-up permission", { kind: "permission", permission: "flying" }],
    ] as const) {
      const attempt = bram.addGrant(sword, grant as never);
      await expect(attempt, `a grant with ${what}`).rejects.toThrow(ValidationError);
      await expect(attempt, `the refusal of ${what}`).rejects.toMatchObject({ field: "grants" });
    }
    const fine = await bram.addGrant(sword, { kind: "die", die: "1d8", condition: "vs undead" });
    expect([fine.kind, fine.condition], "a situational 1d8 die").toEqual(["die", "vs undead"]);
  },
);

rule(
  { req: ["GR-1", "GR-2"], m: "M4" },
  "a player's grant can't be in a group or make a group's die always count: only the skill list's can",
  async () => {
    const { bram, aldric, id } = await bramWithAldric();
    const cases: [string, object, RegExp][] = [
      ["a grouped die", { kind: "die", die: "1d12", group: "cinder-die" }, /group/],
      ["a grouped bonus", { kind: "cm", amount: 9, group: "cm-vs-undead" }, /group/],
      ["die-always", { kind: "die-always", group: "cinder-die" }, /die-always/],
    ];
    for (const [what, grant, names] of cases) {
      const onEntry = bram.addGrant({ entryId: id("aldric-sword") }, grant as never);
      await expect(onEntry, `${what} on Duskfang`).rejects.toThrow(ValidationError);
      await expect(onEntry, `the refusal of ${what} on Duskfang`).rejects.toMatchObject({ field: "grants" });
      await expect(onEntry, `the refusal of ${what} on Duskfang`).rejects.toThrow(names);
      const manual = bram.addManualGrant(aldric.character.id, "Made-up ruling", [grant as never]);
      await expect(manual, `${what} as a manual grant`).rejects.toThrow(ValidationError);
      await expect(manual, `the refusal of ${what} as a manual grant`).rejects.toThrow(names);
    }
    const cm = await bram.totals(aldric.character.id);
    expect([cm.cm.value, cm.dice.extra.length], "Aldric's CM and extra dice after the refusals").toEqual([170, 1]);
  },
);

rule({ req: ["GR-2"], m: "M4" }, "a consumable added with grants is refused, and the refusal says why", async () => {
  const { bram, aldric } = await bramWithAldric();
  const attempt = bram.addEntry(aldric.character.id, {
    category: "consumables",
    name: "Tonic of Fury",
    grants: [{ kind: "cm", amount: 7 }],
  } as never);
  await expect(attempt, "adding a consumable with a grant").rejects.toThrow(ValidationError);
  await expect(attempt, "the refusal").rejects.toMatchObject({ field: "grants" });
  await expect(attempt, "the refusal").rejects.toThrow(/Consumables/);
});

rule(
  { req: ["EQ-8", "IN-14"], m: "M4" },
  "trading the cloak that gave a second Back slot raises an alert naming the cloak and the trade",
  async () => {
    const { bram, aldric, id } = await bramWithAldric();
    const cloak = await bram.addEntry(aldric.character.id, {
      category: "items",
      name: "Cloak of the Wanderer",
      arcane: true,
      grants: [{ kind: "slots", slotKind: "back", amount: 1 }],
    });
    const pack = await bram.addEntry(aldric.character.id, {
      category: "armor",
      name: "Traveller's Pack",
      slotKind: "back",
    });
    for (const [entry, slot] of [
      [cloak.id, "arcane"],
      [id("aldric-cloak"), "back"],
      [pack.id, "back"],
    ] as const) {
      expect((await bram.equip(entry, slot)).outcome, `equipping ${entry} in ${slot}`).toBe("allowed");
    }
    await bram.markTraded(cloak.id, { kind: "traded" });
    const [alert, ...more] = await bram.alerts(aldric.character.id);
    expect(more, "other alerts").toEqual([]);
    expect(alert && [alert.scope, alert.equipped, alert.allowed, alert.lost?.reason], "Aldric's Back alert").toEqual([
      { type: "slot-kind", id: "back" },
      2,
      1,
      "traded",
    ]);
    expect(alert!.message, "the alert names the traded cloak").toContain("Cloak of the Wanderer");
    expect((await bram.lastChange(aldric.character.id))?.reason, "Aldric's last change").toBe("traded");
  },
);

rule(
  { req: ["IN-14", "EQ-4"], m: "M4" },
  "trading part of an equipped stack unequips what's left, as trading always does",
  async () => {
    const { bram, aldric } = await bramWithAldric();
    const daggers = await bram.addEntry(aldric.character.id, {
      category: "weapons",
      name: "Iron Dagger",
      quantity: 2,
      hands: 1,
      range: "melee",
    });
    expect((await bram.equip(daggers.id, "off-hand")).outcome, "equipping the daggers").toBe("allowed");
    await bram.markTraded(daggers.id, { kind: "traded", quantity: 1 });
    const offHand = (await bram.sheet(aldric.character.id)).equipped.filter((q) => q.slot === "off-hand");
    expect(offHand, "what's in Aldric's Off hand after trading one dagger").toEqual([]);
    expect((await bram.entry(daggers.id)).quantity, "daggers left").toBe(1);
  },
);

rule(
  { req: ["EQ-8"], m: "M4" },
  "an alert's cause stays put when something that wasn't counting is traded or deleted, and goes once the alert clears",
  async () => {
    const { bram, aldric, id } = await bramWithAldric();
    const characterId = aldric.character.id;
    const cloak = await bram.addEntry(characterId, {
      category: "items",
      name: "Cloak of the Wanderer",
      arcane: true,
      grants: [{ kind: "slots", slotKind: "back", amount: 1 }],
    });
    const belt = await bram.addEntry(characterId, {
      category: "items",
      name: "Belt of Pockets",
      arcane: true,
      grants: [{ kind: "slots", slotKind: "belt", amount: 1 }],
    });
    const pack = await bram.addEntry(characterId, { category: "armor", name: "Traveller's Pack", slotKind: "back" });
    await bram.equip(cloak.id, "arcane");
    await bram.equip(id("aldric-cloak"), "back");
    await bram.equip(pack.id, "back");
    await bram.markTraded(cloak.id, { kind: "traded" });
    // The belt isn't equipped, so deleting it takes no slot away.
    await bram.deleteEntry(belt.id);
    const [alert] = await bram.alerts(characterId);
    expect(alert?.lost?.reason, "the Back alert's cause after deleting the unequipped belt").toBe("traded");
    expect(alert?.message, "the Back alert still names the traded cloak").toContain("Cloak of the Wanderer");
    await bram.unequip(pack.id);
    expect(await bram.alerts(characterId), "Aldric's alerts once the pack is off").toEqual([]);
    expect(await bram.lastChange(characterId), "the cause, once there's no alert").toBeUndefined();
  },
);

rule(
  { req: ["IN-15", "EQ-2"], m: "M4" },
  "Undo brings an entry back unequipped when its slot has been taken",
  async () => {
    const { w, bram, aldric, id } = await bramWithAldric();
    const characterId = aldric.character.id;
    const deleted = await bram.deleteEntry(id("aldric-helm"));
    const cap = await bram.addEntry(characterId, { category: "armor", name: "Felt Cap", slotKind: "head" });
    expect((await bram.equip(cap.id, "head")).outcome, "equipping the Felt Cap").toBe("allowed");
    w.clock.advanceSeconds(5);
    await deleted.undo();
    const head = (await bram.sheet(characterId)).equipped.filter((q) => q.slot === "head").map((q) => q.entryId);
    expect(head, "what's in Aldric's Head slot after Undo").toEqual([cap.id]);
    expect((await bram.entry(id("aldric-helm"))).category, "Hawkeye Helm, back in the inventory").toBe("armor");
    expect(await bram.alerts(characterId), "Aldric's alerts").toEqual([]);
  },
);

rule(
  { req: ["EQ-4", "IN-8", "EQ-8"], m: "M4" },
  "editing what an equipped entry fits unequips it, and an alert names the edit",
  async () => {
    const { bram, aldric, id } = await bramWithAldric();
    const characterId = aldric.character.id;
    const where = async (entryId: string) =>
      (await bram.sheet(characterId)).equipped.find((q) => q.entryId === entryId)?.slot;
    // Hawkeye Helm edited to fit Neck; Amber Charm edited to not arcane; Duskfang edited to two-handed.
    for (const [fixtureId, patch, what] of [
      ["aldric-helm", { slotKind: "neck" }, "Hawkeye Helm, now fitting Neck"],
      ["aldric-charm", { arcane: false }, "Amber Charm, no longer arcane"],
      ["aldric-sword", { hands: 2 }, "Duskfang, now two-handed"],
    ] as const) {
      await bram.updateEntry(id(fixtureId), patch);
      expect(await where(id(fixtureId)), `where ${what} is equipped`).toBeUndefined();
    }
    const plate = await bram.updateEntry(id("aldric-plate"), { notes: "Polished" });
    expect([plate.notes, await where(id("aldric-plate"))], "Ironclad Plate after an edit to its notes").toEqual([
      "Polished",
      "chest",
    ]);
    // A cloak that gives a second Back slot, edited to fit Neck while two things are in Back.
    const cloak = await bram.addEntry(characterId, {
      category: "armor",
      name: "Cloak of the Wanderer",
      slotKind: "shoulder",
      grants: [{ kind: "slots", slotKind: "back", amount: 1 }],
    });
    const pack = await bram.addEntry(characterId, { category: "armor", name: "Traveller's Pack", slotKind: "back" });
    for (const [entryId, slot] of [
      [cloak.id, "shoulder"],
      [id("aldric-cloak"), "back"],
      [pack.id, "back"],
    ] as const) {
      expect((await bram.equip(entryId, slot)).outcome, `equipping ${entryId} in ${slot}`).toBe("allowed");
    }
    await bram.updateEntry(cloak.id, { slotKind: "neck" });
    const alerts = await bram.alerts(characterId);
    expect(
      alerts.map((a) => [a.scope, a.equipped, a.allowed, a.lost?.reason]),
      "Aldric's alerts after the cloak's edit",
    ).toEqual([[{ type: "slot-kind", id: "back" }, 2, 1, "unequipped"]]);
  },
);

rule(
  { req: ["EQ-4", "NF-3", "GR-3"], m: "M4" },
  "an entry stored as equipped where it no longer fits, as two offline phones can leave it, counts as unequipped",
  async () => {
    const { w, bram, aldric, id } = await bramWithAldric();
    // Phone A changed the helm to fit Neck while phone B had it in Head: both changes kept (NF-3).
    Object.assign(w.db.entries.get(id("aldric-helm"))!, { slotKind: "neck" });
    const sheet = await bram.sheet(aldric.character.id);
    expect(
      sheet.equipped.some((q) => q.entryId === id("aldric-helm")),
      "Hawkeye Helm listed as equipped in Head",
    ).toBe(false);
    expect((await bram.totals(aldric.character.id)).cm.value, "Aldric's CM without the helm's +15").toBe(155);
    expect((await bram.equip(id("aldric-helm"), "neck")).outcome, "equipping the helm in Neck").toBe("allowed");
  },
);

rule(
  { req: ["IN-8", "GR-2"], m: "M4" },
  "an edit's grants are the entry's own however they're written, and anything else is refused, naming grants",
  async () => {
    const { bram, id } = await bramWithAldric();
    const sword = await bram.entry(id("aldric-sword"));
    const own = sword.category === "weapons" ? sword.grants! : [];
    const same = own.map((g) => ({ ...g, condition: undefined }));
    const edited = await bram.updateEntry(id("aldric-sword"), { notes: "Oiled", grants: same });
    expect(edited.notes, "Duskfang's notes, sent with its own grants").toBe("Oiled");
    for (const [what, grants] of [
      ["a list holding nothing", [null]],
      ["text", "lots"],
    ] as const) {
      const attempt = bram.updateEntry(id("aldric-sword"), { grants } as never);
      await expect(attempt, `an edit with grants as ${what}`).rejects.toThrow(ValidationError);
      await expect(attempt, `the refusal of grants as ${what}`).rejects.toMatchObject({ field: "grants" });
    }
  },
);

rule(
  { req: ["IN-15", "EQ-8"], m: "M4" },
  "after Undo brings back an entry unequipped, the alert no longer blames its deletion",
  async () => {
    const { w, bram, aldric, id } = await bramWithAldric();
    const characterId = aldric.character.id;
    const cloak = await bram.addEntry(characterId, {
      category: "armor",
      name: "Cloak of the Wanderer",
      slotKind: "shoulder",
      grants: [{ kind: "slots", slotKind: "back", amount: 1 }],
    });
    const pack = await bram.addEntry(characterId, { category: "armor", name: "Traveller's Pack", slotKind: "back" });
    const mantle = await bram.addEntry(characterId, { category: "armor", name: "Felt Mantle", slotKind: "shoulder" });
    for (const [entryId, slot] of [
      [cloak.id, "shoulder"],
      [id("aldric-cloak"), "back"],
      [pack.id, "back"],
    ] as const) {
      await bram.equip(entryId, slot);
    }
    const deleted = await bram.deleteEntry(cloak.id);
    expect((await bram.alerts(characterId))[0]?.lost?.reason, "the Back alert's cause after deleting").toBe("deleted");
    await bram.equip(mantle.id, "shoulder");
    w.clock.advanceSeconds(5);
    await deleted.undo();
    const [alert] = await bram.alerts(characterId);
    expect([alert?.scope, alert?.lost], "the Back alert after Undo").toEqual([
      { type: "slot-kind", id: "back" },
      undefined,
    ]);
  },
);

rule(
  { req: ["IN-8", "GR-2"], m: "M4" },
  "an edit that sends back no grants for an entry without any is fine",
  async () => {
    const { bram, id } = await bramWithAldric();
    const lantern = await bram.updateEntry(id("aldric-lantern"), { notes: "Trimmed wick", grants: [] });
    expect(lantern.notes, "the Hooded Lantern's notes").toBe("Trimmed wick");
  },
);

rule(
  { req: ["IN-15", "EQ-4", "GR-5"], m: "M4" },
  "undoing the delete of an equipped entry brings it back where it was, with its grants",
  async () => {
    const { w, bram, aldric, id } = await bramWithAldric();
    const deleted = await bram.deleteEntry(id("aldric-plate"));
    expect((await bram.totals(aldric.character.id)).cm.value, "Aldric's CM without Ironclad Plate").toBe(140);
    w.clock.advanceSeconds(5);
    await deleted.undo();
    const chest = (await bram.sheet(aldric.character.id)).equipped.find((q) => q.slot === "chest");
    expect(chest?.entryId, "what's in Aldric's Chest slot after Undo").toBe(id("aldric-plate"));
    expect((await bram.totals(aldric.character.id)).cm.value, "Aldric's CM after Undo").toBe(170);
  },
);

rule(
  { req: ["EQ-8", "TI-2", "CH-2a", "EQ-4", "GR-3", "GR-5"], m: "M4" },
  "every change that takes a slot away is named by the alert it raises",
  async () => {
    type Setup = Awaited<ReturnType<typeof bramWithAldric>>;
    /** Aldric with two things in Back, the second allowed by `grant`; then `lose` takes that slot away. */
    const cases: [string, (s: Setup) => Promise<() => Promise<unknown>>][] = [
      [
        "title-moved",
        async ({ bram }) => {
          const title = await bram.addTitle({
            name: "Wanderer",
            grants: [{ kind: "slots", slotKind: "back", amount: 1 }],
          });
          const isolde = await seedCharacter(bram, "isolde");
          return () => bram.setTitleScope(title.id, { level: "character", characterId: isolde.character.id });
        },
      ],
      [
        "unequipped",
        async ({ bram, aldric }) => {
          const ring = await bram.addEntry(aldric.character.id, {
            category: "items",
            name: "Ring of Reach",
            arcane: true,
            grants: [{ kind: "slots", slotKind: "back", amount: 1 }],
          });
          await bram.equip(ring.id, "arcane");
          return () => bram.unequip(ring.id);
        },
      ],
      [
        "unequipped",
        async ({ bram, id }) => {
          await bram.addGrant({ entryId: id("aldric-wolf") }, { kind: "slots", slotKind: "back", amount: 1 });
          return () => bram.setActive(id("aldric-wolf"), false);
        },
      ],
      [
        "unequipped",
        async ({ bram, id }) => {
          await bram.addGrant({ entryId: id("aldric-wolf") }, { kind: "slots", slotKind: "back", amount: 1 });
          return () => bram.updateEntry(id("aldric-wolf"), { active: false });
        },
      ],
      [
        "grant-removed",
        async ({ bram, aldric }) => {
          const manual = await bram.addManualGrant(aldric.character.id, "DM ruling", [
            { kind: "slots", slotKind: "back", amount: 1 },
          ]);
          return () => bram.removeGrant(manual.grants[0]!.id);
        },
      ],
    ];
    for (const [reason, setUp] of cases) {
      const s = await bramWithAldric();
      const lose = await setUp(s);
      const pack = await s.bram.addEntry(s.aldric.character.id, {
        category: "armor",
        name: "Traveller's Pack",
        slotKind: "back",
      });
      await s.bram.equip(s.id("aldric-cloak"), "back");
      expect((await s.bram.equip(pack.id, "back")).outcome, `a second Back item before ${reason}`).toBe("allowed");
      await lose();
      const alerts = await s.bram.alerts(s.aldric.character.id);
      expect(
        alerts.map((a) => [a.scope, a.equipped, a.allowed, a.lost?.reason]),
        `Aldric's alerts after ${reason}`,
      ).toEqual([[{ type: "slot-kind", id: "back" }, 2, 1, reason]]);
    }
  },
);

rule(
  { req: ["EQ-8", "EQ-6", "CH-2a"], m: "M4" },
  "lowering Isolde's level, or correcting her class, names that change in the arcane slots alert",
  async () => {
    for (const reason of ["level-lowered", "class-corrected"] as const) {
      const w = world();
      const bram = w.as("bram");
      await seedProfile(bram, "bram");
      const isolde = await seedCharacter(bram, "isolde", { full: true });
      for (const name of ["Blue Bead", "Red Bead", "Green Bead", "White Bead"]) {
        const bead = await bram.addEntry(isolde.character.id, { category: "items", name, arcane: true });
        expect((await bram.equip(bead.id, "arcane")).outcome, `equipping ${name}`).toBe("allowed");
      }
      if (reason === "level-lowered") await bram.updateCharacter(isolde.character.id, { level: 8 });
      else await bram.correctClass(isolde.character.id, "Warrior", { confirmed: true });
      const [alert, ...more] = await bram.alerts(isolde.character.id);
      expect(more, `other alerts after ${reason}`).toEqual([]);
      expect([alert?.scope, alert?.lost?.reason], `Isolde's alert after ${reason}`).toEqual([
        { type: "arcane" },
        reason,
      ]);
    }
  },
);

rule(
  { req: ["GR-2", "NF-6"], m: "M4" },
  "a source holds at most 50 grants and a character at most 50 manual grants, and the refusal says so",
  async () => {
    const { bram, aldric, id } = await bramWithAldric();
    const sword = { entryId: id("aldric-sword") };
    // Duskfang has 1 grant from the fixture: 49 more fill it.
    for (let i = 0; i < 49; i++) await bram.addGrant(sword, { kind: "cm", amount: 1 });
    const fiftyFirst = bram.addGrant(sword, { kind: "cm", amount: 1 });
    await expect(fiftyFirst, "a 51st grant on Duskfang").rejects.toMatchObject({ field: "grants" });
    await expect(fiftyFirst, "the refusal").rejects.toThrow(/50/);
    for (let i = 0; i < 50; i++)
      await bram.addManualGrant(aldric.character.id, `Ruling ${i}`, [{ kind: "cm", amount: 1 }]);
    const manual = bram.addManualGrant(aldric.character.id, "One too many", [{ kind: "cm", amount: 1 }]);
    await expect(manual, "a 51st manual grant on Aldric").rejects.toMatchObject({ field: "manualGrants" });
    await expect(manual, "the refusal").rejects.toThrow(/50/);
  },
);

rule(
  { req: ["TI-4", "EQ-8"], m: "M4" },
  "removing a title that gave a Back slot raises an over-limit alert naming the title",
  async () => {
    const { bram, aldric, id } = await bramWithAldric();
    const title = await bram.addTitle({ name: "Wanderer", grants: [{ kind: "slots", slotKind: "back", amount: 1 }] });
    const pack = await bram.addEntry(aldric.character.id, {
      category: "armor",
      name: "Traveller's Pack",
      slotKind: "back",
    });
    await bram.equip(id("aldric-cloak"), "back");
    expect((await bram.equip(pack.id, "back")).outcome, "equipping a second Back item with the title").toBe("allowed");
    await bram.removeTitle(title.id);
    const alerts = await bram.alerts(aldric.character.id);
    expect(
      alerts.map((a) => [a.scope, a.equipped, a.allowed]),
      "Aldric's alerts",
    ).toEqual([[{ type: "slot-kind", id: "back" }, 2, 1]]);
    expect(alerts[0]!.lost?.reason, "why the slot was lost").toBe("title-removed");
    expect(alerts[0]!.message, "the alert message").toContain("Wanderer");
  },
);

// ---------------------------------------------------------------- fewer reads (TF-2, NF-5)

/** Aldric with the cloak that gives a second Back slot, and two things in Back. */
async function aldricWithTwoInBack() {
  const s = await bramWithAldric();
  const characterId = s.aldric.character.id;
  const cloak = await s.bram.addEntry(characterId, {
    category: "items",
    name: "Cloak of the Wanderer",
    arcane: true,
    grants: [{ kind: "slots", slotKind: "back", amount: 1 }],
  });
  const pack = await s.bram.addEntry(characterId, { category: "armor", name: "Traveller's Pack", slotKind: "back" });
  for (const [entryId, slot] of [
    [cloak.id, "arcane"],
    [s.id("aldric-cloak"), "back"],
    [pack.id, "back"],
  ] as const) {
    expect((await s.bram.equip(entryId, slot)).outcome, `equipping ${entryId} in ${slot}`).toBe("allowed");
  }
  return { ...s, characterId, cloak, pack };
}

rule(
  { req: ["EQ-8", "NF-5"], m: "M4" },
  "the sheet with its alerts is the sheet and the alerts, read once, naming the trade that lost a Back slot",
  async () => {
    const { bram, characterId, cloak } = await aldricWithTwoInBack();
    await bram.markTraded(cloak.id, { kind: "traded" });
    const { sheet, alerts } = await bram.sheetWithAlerts(characterId);
    expect(sheet, "Aldric's sheet, read with its alerts").toEqual(await bram.sheet(characterId));
    expect(
      alerts.map((a) => [a.scope, a.equipped, a.allowed, a.lost?.reason]),
      "Aldric's alerts, read with the sheet",
    ).toEqual([[{ type: "slot-kind", id: "back" }, 2, 1, "traded"]]);
    expect(alerts[0]!.message, "the alert names the traded cloak").toContain("Cloak of the Wanderer");
    expect(alerts, "the same alerts as alerts() gives").toEqual(await bram.alerts(characterId));
  },
);

rule(
  { req: ["EQ-8", "NF-5"], m: "M4" },
  "the sheet with its alerts forgets the cause once nothing is over its limit, so a later alert never names it",
  async () => {
    const { bram, characterId, cloak, pack } = await aldricWithTwoInBack();
    await bram.markTraded(cloak.id, { kind: "traded" });
    expect((await bram.lastChange(characterId))?.reason, "Aldric's last change after the trade").toBe("traded");
    await bram.unequip(pack.id);
    expect((await bram.sheetWithAlerts(characterId)).alerts, "Aldric's alerts once the pack is off").toEqual([]);
    expect(await bram.lastChange(characterId), "the cause, once there's no alert").toBeUndefined();
  },
);

rule(
  { req: ["GR-2", "GR-5", "NF-5"], m: "M4" },
  "removing a manual grant removes all its grants at once, and leaves Aldric's other manual grant",
  async () => {
    const { bram, aldric } = await bramWithAldric();
    const characterId = aldric.character.id;
    const ruling = await bram.addManualGrant(characterId, "DM ruling, Faire 2026", [
      { kind: "cm", amount: 3 },
      { kind: "mitigation", amount: 1 },
    ]);
    await bram.addManualGrant(characterId, "Made-up boon", [{ kind: "cm", amount: 2 }]);
    await bram.removeManualGrant(characterId, ruling.id);
    const totals = await bram.totals(characterId);
    expect([totals.cm.value, totals.mitigation.value], "Aldric's CM and mitigation after removing the ruling").toEqual([
      172, 3,
    ]);
    expect(
      (await bram.sheet(characterId)).manualGrants.map((m) => m.reason),
      "Aldric's manual grants afterwards",
    ).toEqual(["Made-up boon"]);
  },
);

rule(
  { req: ["GR-5", "EQ-8"], m: "M4" },
  "removing a manual grant that gave a Back slot raises an alert that names its removal",
  async () => {
    const s = await bramWithAldric();
    const characterId = s.aldric.character.id;
    const manual = await s.bram.addManualGrant(characterId, "DM ruling", [
      { kind: "slots", slotKind: "back", amount: 1 },
    ]);
    const pack = await s.bram.addEntry(characterId, { category: "armor", name: "Traveller's Pack", slotKind: "back" });
    await s.bram.equip(s.id("aldric-cloak"), "back");
    expect((await s.bram.equip(pack.id, "back")).outcome, "a second Back item with the ruling").toBe("allowed");
    await s.bram.removeManualGrant(characterId, manual.id);
    expect(
      (await s.bram.alerts(characterId)).map((a) => [a.scope, a.equipped, a.allowed, a.lost?.reason]),
      "Aldric's alerts after removing the ruling",
    ).toEqual([[{ type: "slot-kind", id: "back" }, 2, 1, "grant-removed"]]);
  },
);

rule(
  { req: ["GR-2"], m: "M4" },
  "removing a manual grant that isn't Aldric's is refused, naming it, and changes nothing",
  async () => {
    const { bram, aldric } = await bramWithAldric();
    const isolde = await seedCharacter(bram, "isolde");
    const ruling = await bram.addManualGrant(isolde.character.id, "Isolde's ruling", [{ kind: "cm", amount: 4 }]);
    const attempt = bram.removeManualGrant(aldric.character.id, ruling.id);
    await expect(attempt, "removing Isolde's ruling from Aldric").rejects.toThrow(NotFoundError);
    await expect(attempt, "the refusal").rejects.toThrow(new RegExp(ruling.id));
    expect(
      (await bram.sheet(isolde.character.id)).manualGrants.map((m) => m.reason),
      "Isolde's manual grants afterwards",
    ).toEqual(["Isolde's ruling"]);
  },
);

rule(
  { req: ["GR-5", "NF-5"], m: "M4" },
  "a grant removed from the entry or title it's on stops counting; named on another, it's refused and stays",
  async () => {
    const { bram, aldric, id } = await bramWithAldric();
    const characterId = aldric.character.id;
    const onHelm = await bram.addGrant({ entryId: id("aldric-helm") }, { kind: "cm", amount: 4 });
    const title = (await bram.listTitles()).find((t) => t.name === "Friend of the Forest")!;
    const onTitle = await bram.addGrant({ titleId: title.id }, { kind: "cm", amount: 2 });
    expect((await bram.totals(characterId)).cm.value, "Aldric's CM with both grants").toBe(176);

    const wrong = bram.removeGrant(onHelm.id, { entryId: id("aldric-sword") });
    await expect(wrong, "removing the helm's grant from Duskfang").rejects.toThrow(NotFoundError);
    await expect(wrong, "the refusal").rejects.toThrow(new RegExp(onHelm.id));
    const wrongTitle = bram.removeGrant(onHelm.id, { titleId: title.id });
    await expect(wrongTitle, "removing the helm's grant from the title").rejects.toThrow(NotFoundError);
    expect((await bram.totals(characterId)).cm.value, "Aldric's CM after the refusals").toBe(176);

    await bram.removeGrant(onHelm.id, { entryId: id("aldric-helm") });
    expect((await bram.totals(characterId)).cm.value, "Aldric's CM without the helm's +4").toBe(172);
    await bram.removeGrant(onTitle.id, { titleId: title.id });
    expect((await bram.totals(characterId)).cm.value, "Aldric's CM without the title's +2").toBe(170);
  },
);

rule(
  { req: ["GR-5", "EQ-8"], m: "M4" },
  "removing a Back slot's grant from the entry it's on raises an alert that names its removal",
  async () => {
    const s = await bramWithAldric();
    const characterId = s.aldric.character.id;
    const grant = await s.bram.addGrant(
      { entryId: s.id("aldric-wolf") },
      { kind: "slots", slotKind: "back", amount: 1 },
    );
    const pack = await s.bram.addEntry(characterId, { category: "armor", name: "Traveller's Pack", slotKind: "back" });
    await s.bram.equip(s.id("aldric-cloak"), "back");
    expect((await s.bram.equip(pack.id, "back")).outcome, "a second Back item with the wolf's grant").toBe("allowed");
    await s.bram.removeGrant(grant.id, { entryId: s.id("aldric-wolf") });
    expect(
      (await s.bram.alerts(characterId)).map((a) => [a.scope, a.equipped, a.allowed, a.lost?.reason]),
      "Aldric's alerts after removing the wolf's grant",
    ).toEqual([[{ type: "slot-kind", id: "back" }, 2, 1, "grant-removed"]]);
  },
);

rule(
  { req: ["EQ-5", "IN-14", "NF-5"], m: "M4" },
  "an entry read with its slot gives the character, the entry and where it's equipped, or no entry once it's gone",
  async () => {
    const { bram, aldric, id } = await bramWithAldric();
    const characterId = aldric.character.id;
    const sword = await bram.entryWithSlot(characterId, id("aldric-sword"));
    expect([sword.character.name, sword.slot], "Duskfang's character and slot").toEqual(["Aldric", "main-hand"]);
    expect(sword.entry, "Duskfang, as entry() gives it").toEqual(await bram.entry(id("aldric-sword")));
    const lantern = await bram.entryWithSlot(characterId, id("aldric-lantern"));
    expect(lantern.entry, "the Hooded Lantern, as entry() gives it").toEqual(await bram.entry(id("aldric-lantern")));
    expect(lantern.slot, "where the Hooded Lantern is equipped").toBeUndefined();
    await bram.markTraded(id("aldric-sword"), { kind: "traded" });
    const traded = await bram.entryWithSlot(characterId, id("aldric-sword"));
    expect([traded.character.name, traded.entry, traded.slot], "Duskfang once traded away").toEqual([
      "Aldric",
      null,
      undefined,
    ]);
  },
);

rule(
  { req: ["EQ-5", "CH-1"], m: "M4" },
  "an entry read under another of Bram's characters isn't found there, and a character that isn't there is refused",
  async () => {
    const { bram, aldric, id } = await bramWithAldric();
    const isolde = await seedCharacter(bram, "isolde");
    const elsewhere = await bram.entryWithSlot(isolde.character.id, id("aldric-sword"));
    expect([elsewhere.character.name, elsewhere.entry, elsewhere.slot], "Duskfang read under Isolde").toEqual([
      "Isolde",
      null,
      undefined,
    ]);
    await bram.deleteCharacter(isolde.character.id, "Isolde");
    await expect(
      bram.entryWithSlot(isolde.character.id, id("aldric-sword")),
      "reading under a deleted character",
    ).rejects.toThrow(NotFoundError);
    expect((await bram.entryWithSlot(aldric.character.id, id("aldric-sword"))).slot, "Duskfang under Aldric").toBe(
      "main-hand",
    );
  },
);

rule(
  { req: ["EQ-4", "NF-3"], m: "M4" },
  "an entry read with its slot isn't equipped where it no longer fits, as two offline phones can leave it",
  async () => {
    const { w, bram, aldric, id } = await bramWithAldric();
    Object.assign(w.db.entries.get(id("aldric-helm"))!, { slotKind: "neck" });
    const helm = await bram.entryWithSlot(aldric.character.id, id("aldric-helm"));
    expect(helm.entry?.id, "Hawkeye Helm, stored in Head but now fitting Neck").toBe(id("aldric-helm"));
    expect(helm.slot, "where Hawkeye Helm is equipped").toBeUndefined();
  },
);

rule(
  { req: ["EQ-2", "EQ-3", "NF-5"], m: "M4" },
  "equipping in the first free place tries each in turn: a dagger finds the Main hand full and goes in the Off hand",
  async () => {
    const { bram, aldric, id } = await bramWithAldric();
    const characterId = aldric.character.id;
    const dagger = await bram.addEntry(characterId, {
      category: "weapons",
      name: "Iron Dagger",
      hands: 1,
      range: "melee",
    });
    const checks = await bram.equipFirst(dagger.id, ["main-hand", "off-hand"]);
    expect(
      checks.map((c) => [c.outcome, c.block?.reason]),
      "the checks for the Main hand, then the Off hand",
    ).toEqual([
      ["blocked", "slot-full"],
      ["allowed", undefined],
    ]);
    expect(checks[0]!.block?.message, "the Main hand's block names what's in it").toContain("Duskfang");
    const hands = (await bram.sheet(characterId)).equipped.filter((q) => q.slot.endsWith("hand"));
    expect(
      hands.map((q) => [q.slot, q.entryId]),
      "Aldric's hands afterwards",
    ).toEqual(
      expect.arrayContaining([
        ["main-hand", id("aldric-sword")],
        ["off-hand", dagger.id],
      ]),
    );
    expect(hands, "what's in Aldric's hands").toHaveLength(2);
  },
);

rule(
  { req: ["EQ-2", "EQ-3", "NF-5"], m: "M4" },
  "equipping in the first free place stops at the first that's free, and with every place full changes nothing",
  async () => {
    const { bram, aldric, id } = await bramWithAldric();
    const characterId = aldric.character.id;
    const first = await bram.addEntry(characterId, {
      category: "weapons",
      name: "Iron Dagger",
      hands: 1,
      range: "melee",
    });
    const tried = await bram.equipFirst(first.id, ["off-hand", "main-hand"]);
    expect(
      tried.map((c) => c.outcome),
      "the dagger tried in the free Off hand first",
    ).toEqual(["allowed"]);
    const second = await bram.addEntry(characterId, {
      category: "weapons",
      name: "Bone Knife",
      hands: 1,
      range: "melee",
    });
    const before = (await bram.sheet(characterId)).equipped;
    const checks = await bram.equipFirst(second.id, ["main-hand", "off-hand"]);
    expect(
      checks.map((c) => [c.outcome, c.block?.reason, c.block?.occupants.map((o) => o.entryId)]),
      "the Bone Knife tried in each full hand",
    ).toEqual([
      ["blocked", "slot-full", [id("aldric-sword")]],
      ["blocked", "slot-full", [first.id]],
    ]);
    expect((await bram.sheet(characterId)).equipped, "what Aldric has equipped afterwards").toEqual(before);
  },
);
