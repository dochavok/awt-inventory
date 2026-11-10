// History (section 7: HI-1 to HI-5), through the data layer. The events are
// also checked where they're caused, in inventory.test.ts and characters.test.ts.

import { expect } from "vitest";
import { rule } from "../support/rule";
import { seedCharacter, seedProfile, world } from "../support/world";

async function bramWithAldric() {
  const w = world();
  const bram = w.as("bram");
  await seedProfile(bram, "bram");
  const aldric = await seedCharacter(bram, "aldric");
  const id = (fixtureId: string) => aldric.entries.get(fixtureId)!.id;
  return { w, bram, characterId: aldric.character.id, id };
}

rule({ req: ["HI-1"], m: "M2" }, "each character has its own history, newest first", async () => {
  const { w, bram, characterId, id } = await bramWithAldric();
  const isolde = await seedCharacter(bram, "isolde");
  w.clock.advanceSeconds(60);
  await bram.markUsed(id("aldric-draught"));
  w.clock.advanceSeconds(60);
  await bram.markUsed(id("aldric-shard"));
  const history = await bram.history(characterId);
  expect(
    history.slice(0, 2).map((r) => r.entryName),
    "Aldric's two newest records",
  ).toEqual(["Ember Shard", "Healing Draught"]);
  const dates = history.map((r) => r.date);
  expect(dates, "Aldric's history dates, newest first").toEqual([...dates].sort().reverse());
  const isoldes = await bram.history(isolde.character.id);
  expect(
    isoldes.some((r) => r.entryName === "Healing Draught"),
    "Aldric's draught in Isolde's history",
  ).toBe(false);
});

rule(
  { req: ["HI-3", "NF-8"], m: "M2" },
  "an event can be dated earlier, and the record also keeps when it was entered, both in UTC",
  async () => {
    const { w, bram, id } = await bramWithAldric();
    w.clock.set("2026-06-15T02:30:00.000Z");
    const record = await bram.markUsed(id("aldric-draught"), {
      date: "2026-06-13T19:00:00.000Z",
      note: "used at the faire on Saturday",
    });
    expect(record.date, "when it happened").toBe("2026-06-13T19:00:00.000Z");
    expect(record.enteredAt, "when it was recorded").toBe("2026-06-15T02:30:00.000Z");
  },
);

rule({ req: ["HI-3", "NF-8"], m: "M2" }, "an event date given with a time zone offset is stored in UTC", async () => {
  const { bram, id } = await bramWithAldric();
  const record = await bram.markUsed(id("aldric-draught"), { date: "2026-06-13T14:00:00-05:00" });
  expect(record.date, "the stored date").toBe("2026-06-13T19:00:00.000Z");
});

rule({ req: ["HI-4"], m: "M2" }, "editing an entry never changes its earlier history records", async () => {
  const { bram, characterId, id } = await bramWithAldric();
  const used = await bram.markUsed(id("aldric-draught"));
  await bram.updateEntry(id("aldric-draught"), { name: "Greater Draught" });
  const record = (await bram.history(characterId)).find((r) => r.id === used.id);
  expect(record?.entryName, "the name on the earlier used record").toBe("Healing Draught");
});

rule({ req: ["HI-4"], m: "M2" }, "the data layer offers no way to edit or remove a single history record", async () => {
  const { bram } = await bramWithAldric();
  const methods = Object.keys(bram);
  const editing = methods.filter((m) => /history|record/i.test(m) && m !== "history");
  expect(editing, "store methods that could change history records").toEqual([]);
  expect(typeof bram.history, "reading the history").toBe("function");
  await bram.history((await bram.listCharacters("main"))[0]!.id);
});

rule({ req: ["HI-5"], m: "M3" }, "the history can be filtered by event and by category", async () => {
  const { bram, characterId, id } = await bramWithAldric();
  await bram.markUsed(id("aldric-draught"));
  await bram.markUsed(id("aldric-shard"));
  await bram.updateCharacter(characterId, { level: 26 });
  const used = await bram.history(characterId, { events: ["used"] });
  expect(used.map((r) => r.entryName).sort(), "used records").toEqual(["Ember Shard", "Healing Draught"]);
  const components = await bram.history(characterId, { categories: ["components"] });
  expect(
    components.map((r) => [r.event, r.entryName]),
    "component records",
  ).toEqual([
    ["used", "Ember Shard"],
    ["acquired", "Ember Shard"],
  ]);
  const usedComponents = await bram.history(characterId, { events: ["used"], categories: ["components"] });
  expect(
    usedComponents.map((r) => r.entryName),
    "used component records",
  ).toEqual(["Ember Shard"]);
});
