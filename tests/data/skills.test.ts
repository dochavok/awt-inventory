// Skills through the data layer (section 6): adding from the list (SK-1, SK-3,
// SK-5), what's shown (SK-2), removing (SK-4), permanent IDs (SK-8), and
// changes to the skill list (SK-9).

import { expect } from "vitest";
import { NotFoundError, ValidationError } from "../../src/errors";
import { rule } from "../support/rule";
import { seedCharacter, seedProfile, world } from "../support/world";

async function bramWithAldric(settings: { showSkillText?: boolean } = {}) {
  const w = world(settings);
  const bram = w.as("bram");
  await seedProfile(bram, "bram");
  const aldric = await seedCharacter(bram, "aldric");
  return { w, bram, aldric, id: aldric.character.id };
}

rule({ req: ["SK-1"], m: "M2" }, "a skill is added with how and when it was gained, and notes", async () => {
  const { bram, id } = await bramWithAldric();
  const { entry, warnings } = await bram.addSkill(id, {
    skillId: "twin-fangs",
    howGained: "quest",
    levelGained: 24,
    notes: "From the made-up duel quest",
  });
  expect(warnings, "warnings for Twin Fangs").toEqual([]);
  const shown = (await bram.skills(id)).find((s) => s.entryId === entry.id);
  expect(shown, "Aldric's Twin Fangs").toMatchObject({
    skillId: "twin-fangs",
    name: "Twin Fangs",
    howGained: "quest",
    levelGained: 24,
    notes: "From the made-up duel quest",
  });
});

rule({ req: ["SK-3"], m: "M2" }, "a skill that warns is still added", async () => {
  const { bram, id } = await bramWithAldric();
  const { warnings } = await bram.addSkill(id, { skillId: "cleave", howGained: "other", levelGained: 25 });
  expect(
    warnings.map((w) => w.reason),
    "warnings for Cleave",
  ).toEqual(["missing-prerequisite"]);
  expect(
    (await bram.skills(id)).map((s) => s.name),
    "Aldric's skills",
  ).toContain("Cleave");
});

rule(
  { req: ["SK-2", "RD-8"], m: "M2" },
  "a skill shows its name, tree, usage and tier, and no card text until the owner agrees",
  async () => {
    const w = world({ showSkillText: false });
    const cass = w.as("cass");
    await seedProfile(cass, "cass");
    const brin = await seedCharacter(cass, "brin");
    await cass.addSkill(brin.character.id, { skillId: "veil", howGained: "level-up", levelGained: 8 });
    const veil = (await cass.skills(brin.character.id)).find((s) => s.skillId === "veil");
    expect(veil, "Brin's Veil").toMatchObject({ name: "Veil", tree: "Shadowcraft", usage: "1/combat", tier: "epic" });
    expect(veil?.text, "Veil's card text without the owner's agreement").toBeUndefined();
  },
);

rule({ req: ["SK-2"], m: "M2" }, "once the owner agrees, the card text from the skill list is shown", async () => {
  const w = world({ showSkillText: true });
  const cass = w.as("cass");
  await seedProfile(cass, "cass");
  const brin = await seedCharacter(cass, "brin");
  await cass.addSkill(brin.character.id, { skillId: "veil", howGained: "level-up", levelGained: 8 });
  const veil = (await cass.skills(brin.character.id)).find((s) => s.skillId === "veil");
  expect(veil?.text, "Veil's card text").toBe("Made-up card text for tests: the user fades from sight for one round.");
});

rule(
  { req: ["SK-2", "RD-7"], m: "M2" },
  "a maintainer note in the skill list is never shown to the player",
  async () => {
    const { bram, id } = await bramWithAldric({ showSkillText: true });
    await bram.addSkill(id, { skillId: "stoneskin", howGained: "level-up", levelGained: 25 });
    const shown = JSON.stringify(await bram.skills(id));
    expect(shown, "Aldric's skills as shown").not.toContain("Made-up note for tests");
    expect(shown, "Aldric's skills as shown").toContain("Stoneskin");
  },
);

rule({ req: ["SK-4", "IN-15"], m: "M2" }, "a skill can be deleted like any entry", async () => {
  const { bram, aldric, id } = await bramWithAldric();
  await bram.deleteEntry(aldric.entries.get("aldric-sk-focus")!.id);
  expect(
    (await bram.skills(id)).map((s) => s.name),
    "Aldric's skills after deleting Battle Focus",
  ).not.toContain("Battle Focus");
});

rule(
  { req: ["SK-4"], m: "M2" },
  "a skill can't be marked used or traded, and the refusal names the skill",
  async () => {
    const { bram, aldric } = await bramWithAldric();
    const guard = aldric.entries.get("aldric-sk-guard")!.id;
    await expect(bram.markUsed(guard), "marking Iron Guard used").rejects.toThrow(ValidationError);
    await expect(bram.markUsed(guard), "marking Iron Guard used").rejects.toThrow(/Iron Guard/);
    await expect(bram.markTraded(guard, { kind: "traded" }), "trading Iron Guard").rejects.toThrow(ValidationError);
  },
);

rule({ req: ["SK-5"], m: "M2" }, "a skill that isn't in the list can't be added", async () => {
  const { bram, id } = await bramWithAldric();
  const attempt = bram.addSkill(id, { skillId: "made-up-unknown-skill", howGained: "other", levelGained: 25 });
  await expect(attempt, "adding an unknown skill").rejects.toThrow(NotFoundError);
  await expect(attempt, "adding an unknown skill").rejects.toMatchObject({
    kind: "skill",
    id: "made-up-unknown-skill",
  });
  expect((await bram.skills(id)).length, "Aldric's number of skills").toBe(6);
});

rule({ req: ["SK-5", "RD-3"], m: "M2" }, "a retired skill can't be newly added", async () => {
  const w = world();
  const bram = w.as("bram");
  await seedProfile(bram, "bram");
  const isolde = await seedCharacter(bram, "isolde");
  const attempt = bram.addSkill(isolde.character.id, { skillId: "glimmer", howGained: "level-up", levelGained: 13 });
  await expect(attempt, "adding the retired Glimmer").rejects.toThrow(ValidationError);
  await expect(attempt, "adding the retired Glimmer").rejects.toThrow(/Glimmer/);
});

rule({ req: ["SK-5", "RD-3"], m: "M2" }, "a skill in a retired tree can't be newly added", async () => {
  const { w, bram, id } = await bramWithAldric();
  w.ref.trees.find((t) => t.id === "bladework")!.retired = true;
  const attempt = bram.addSkill(id, { skillId: "twin-fangs", howGained: "level-up", levelGained: 25 });
  await expect(attempt, "adding Twin Fangs from the retired Bladework tree").rejects.toThrow(ValidationError);
  await expect(attempt, "adding Twin Fangs from the retired Bladework tree").rejects.toThrow(/Twin Fangs/);
  expect(
    (await bram.skills(id)).map((s) => s.skillId),
    "Aldric's skills",
  ).not.toContain("twin-fangs");
});

rule(
  { req: ["SK-8", "RD-2"], m: "M2" },
  "characters keep skills by ID, so renaming a skill in the list renames it on the character",
  async () => {
    const { w, bram, id } = await bramWithAldric();
    w.ref.skills.find((s) => s.id === "iron-guard")!.name = "Iron Guard (renamed)";
    const guard = (await bram.skills(id)).find((s) => s.skillId === "iron-guard");
    expect(guard?.name, "Aldric's Iron Guard after the rename").toBe("Iron Guard (renamed)");
  },
);

rule({ req: ["SK-9"], m: "M5" }, "changed text in the skill list shows on every character straight away", async () => {
  const { w, bram, id } = await bramWithAldric({ showSkillText: true });
  w.ref.skills.find((s) => s.id === "iron-guard")!.text = "Made-up new text.";
  expect((await bram.skills(id)).find((s) => s.skillId === "iron-guard")?.text, "Iron Guard's text").toBe(
    "Made-up new text.",
  );
});

rule(
  { req: ["SK-9", "RD-3"], m: "M5" },
  "a skill retired from the list stays readable on a character that has it",
  async () => {
    const { w, bram, id } = await bramWithAldric();
    w.ref.skills.find((s) => s.id === "battle-focus")!.retired = true;
    const focus = (await bram.skills(id)).find((s) => s.skillId === "battle-focus");
    expect(focus, "Aldric's Battle Focus after it's retired").toMatchObject({ name: "Battle Focus", retired: true });
  },
);

rule(
  { req: ["SK-9"], m: "M5" },
  "merged skills ask the player to review them, and accepting swaps in the replacement",
  async () => {
    const w = world();
    const bram = w.as("bram");
    await seedProfile(bram, "bram");
    const isolde = await seedCharacter(bram, "isolde");
    const id = isolde.character.id;
    // Glimmer and Flicker were on Isolde before the list merged them into Radiance.
    w.ref.skills.find((s) => s.id === "glimmer")!.retired = false;
    w.ref.skills.find((s) => s.id === "flicker")!.retired = false;
    const glimmer = await bram.addSkill(id, { skillId: "glimmer", howGained: "level-up", levelGained: 2 });
    await bram.addSkill(id, { skillId: "flicker", howGained: "level-up", levelGained: 3 });
    w.ref.skills.find((s) => s.id === "glimmer")!.retired = true;
    w.ref.skills.find((s) => s.id === "flicker")!.retired = true;

    const notices = await bram.skillReplacements(id);
    expect(
      notices.map((n) => [n.skillId, n.replacedBy]),
      "Isolde's skills to review",
    ).toEqual([
      ["flicker", ["radiance"]],
      ["glimmer", ["radiance"]],
    ]);
    for (const notice of notices) {
      for (const name of ["Glimmer", "Flicker", "Radiance"]) {
        expect(notice.message, `the review notice for ${notice.skillId}`).toContain(name);
      }
    }
    await bram.acceptReplacement(glimmer.entry.id);
    const names = (await bram.skills(id)).map((s) => s.name);
    expect(names, "Isolde's skills after accepting").toContain("Radiance");
    expect(names, "Isolde's skills after accepting").not.toContain("Glimmer");
  },
);
