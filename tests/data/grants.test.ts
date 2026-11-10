// Grants through the data layer (GR-2, GR-5, TI-4, TI-5): which sources can
// carry them, and that totals follow every change at once.

import { expect } from "vitest";
import { ValidationError } from "../../src/errors";
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
  { req: ["TI-5", "GR-3"], m: "M4" },
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
  { req: ["TI-5", "TI-2"], m: "M4" },
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
