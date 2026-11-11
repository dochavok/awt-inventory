// Titles (section 4.2: TI-1 to TI-4), through the data layer. Title grants
// (TI-5) are in tests/data/grants.test.ts.

import { expect } from "vitest";
import { AccessDeniedError, ValidationError } from "../../src/errors";
import { rule } from "../support/rule";
import { seedCharacter, seedProfile, world } from "../support/world";

async function bramWithTwo() {
  const w = world();
  const bram = w.as("bram");
  await seedProfile(bram, "bram");
  const aldric = await seedCharacter(bram, "aldric");
  const isolde = await seedCharacter(bram, "isolde");
  return { w, bram, aldric: aldric.character, isolde: isolde.character };
}

rule({ req: ["TI-1"], m: "M2" }, "a title is added with a name, description and date earned", async () => {
  const { bram } = await bramWithTwo();
  const title = await bram.addTitle({
    name: "Hero of the Bridge",
    description: "Held the made-up bridge.",
    earned: "2026-06-13",
  });
  expect(
    (await bram.listTitles()).find((t) => t.id === title.id),
    "Hero of the Bridge as stored",
  ).toMatchObject({
    name: "Hero of the Bridge",
    description: "Held the made-up bridge.",
    earned: "2026-06-13",
  });
});

rule({ req: ["TI-1"], m: "M2" }, "a title's description and date are optional, but its name isn't", async () => {
  const { bram } = await bramWithTwo();
  const plain = await bram.addTitle({ name: "Plain Title" });
  expect(plain.description, "the description of a title added without one").toBeUndefined();
  const attempt = bram.addTitle({ name: "  " });
  await expect(attempt, "a title with a blank name").rejects.toThrow(ValidationError);
  await expect(attempt, "a title with a blank name").rejects.toMatchObject({ field: "name" });
});

rule(
  { req: ["TI-2"], m: "M2" },
  "a new title is player-level and applies to every character, including ones created later",
  async () => {
    const { bram, aldric, isolde } = await bramWithTwo();
    const title = await bram.addTitle({ name: "Hero of the Bridge" });
    expect(title.scope, "the new title's scope").toEqual({ level: "player" });
    const wren = await bram.createCharacter({ name: "Wren", className: "Rogue", level: 3 });
    for (const [name, id] of [
      ["Aldric", aldric.id],
      ["Isolde", isolde.id],
      ["Wren", wren.id],
    ] as const) {
      expect(
        (await bram.titlesFor(id)).map((t) => t.name),
        `titles applying to ${name}`,
      ).toContain("Hero of the Bridge");
    }
  },
);

rule(
  { req: ["TI-2"], m: "M2" },
  "a title switched to character-level applies to that character only, and can switch back",
  async () => {
    const { bram, aldric, isolde } = await bramWithTwo();
    const title = await bram.addTitle({ name: "Hero of the Bridge" });
    await bram.setTitleScope(title.id, { level: "character", characterId: isolde.id });
    expect(
      (await bram.titlesFor(isolde.id)).map((t) => t.name),
      "Isolde's titles",
    ).toContain("Hero of the Bridge");
    expect(
      (await bram.titlesFor(aldric.id)).map((t) => t.name),
      "Aldric's titles",
    ).not.toContain("Hero of the Bridge");
    expect(
      (await bram.charactersFor(title.id)).map((c) => c.name),
      "characters the title lists",
    ).toEqual(["Isolde"]);
    await bram.setTitleScope(title.id, { level: "player" });
    expect(
      (await bram.titlesFor(aldric.id)).map((t) => t.name),
      "Aldric's titles after switching back",
    ).toContain("Hero of the Bridge");
  },
);

rule(
  { req: ["TI-2", "PV-1"], m: "M2" },
  "a title can't be made character-level for another user's character",
  async () => {
    const { w, bram } = await bramWithTwo();
    const cass = w.as("cass");
    await seedProfile(cass, "cass");
    const brin = await seedCharacter(cass, "brin");
    const title = await bram.addTitle({ name: "Hero of the Bridge" });
    await expect(
      bram.setTitleScope(title.id, { level: "character", characterId: brin.character.id }),
      "Bram pointing his title at Cass's Brin",
    ).rejects.toThrow(AccessDeniedError);
    expect((await bram.listTitles()).find((t) => t.id === title.id)?.scope, "the title's scope").toEqual({
      level: "player",
    });
  },
);

rule({ req: ["TI-3"], m: "M2" }, "a Patreon tier is recorded as an ordinary title", async () => {
  const { bram, aldric } = await bramWithTwo();
  await bram.addTitle({ name: "Patreon: Made-up Tier", description: "Supporter tier (made up for tests)." });
  expect(
    (await bram.titlesFor(aldric.id)).map((t) => t.name),
    "Aldric's titles",
  ).toContain("Patreon: Made-up Tier");
});

rule({ req: ["TI-4"], m: "M2" }, "a title can be edited and removed", async () => {
  const { bram, aldric } = await bramWithTwo();
  const title = await bram.addTitle({ name: "Hero of the Brige" });
  await bram.updateTitle(title.id, { name: "Hero of the Bridge", description: "Fixed the typo." });
  expect(
    (await bram.listTitles()).find((t) => t.id === title.id),
    "the edited title",
  ).toMatchObject({
    name: "Hero of the Bridge",
    description: "Fixed the typo.",
  });
  await bram.removeTitle(title.id);
  expect(
    (await bram.listTitles()).map((t) => t.name),
    "Bram's titles after removing it",
  ).toEqual(["Friend of the Forest"]);
  expect(
    (await bram.titlesFor(aldric.id)).map((t) => t.name),
    "Aldric's titles",
  ).not.toContain("Hero of the Bridge");
});

rule({ req: ["TI-1"], m: "M2" }, "a date earned must be a real day", async () => {
  const { bram } = await bramWithTwo();
  for (const earned of ["2026-02-31", "2026-04-31", "2026-13-01", "June 13"]) {
    const attempt = bram.addTitle({ name: `Title for ${earned}`, earned });
    await expect(attempt, `a title earned on ${earned}`).rejects.toMatchObject({ field: "earned" });
  }
  expect((await bram.addTitle({ name: "Leap Day Title", earned: "2028-02-29" })).earned, "a leap day").toBe(
    "2028-02-29",
  );
});
