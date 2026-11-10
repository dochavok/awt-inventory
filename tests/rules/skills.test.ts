// Skills in the rules core (section 6): the picker's two lists (SK-1, SK-1a),
// the warnings (SK-3), and the record check (SK-6). Made-up skills from
// tests/fixtures/refdata/skills.yaml. Aldric (Warrior 25) has Blade Basics,
// Iron Guard, Veteran's Edge three times (its limit) and Battle Focus.

import { expect } from "vitest";
import { recordCheck, skillPicker, skillWarnings, type CharacterSheet } from "../../src/rules";
import { fixtureSheet, testReferenceData } from "../support/fixtures";
import { rule } from "../support/rule";

const ref = testReferenceData();
const names = (options: { skillId: string }[]) =>
  options.map((o) => ref.skills.find((s) => s.id === o.skillId)!.name).sort();

function newWarrior(level: number): CharacterSheet {
  return {
    character: { id: "new", name: "Rook", className: "Warrior", level },
    entries: [],
    equipped: [],
    titles: [],
    manualGrants: [],
  };
}

rule(
  { req: ["SK-1a", "SK-1"], m: "M2" },
  "Aldric's picker offers first the skills he can take now, in his own trees",
  () => {
    const picker = skillPicker(fixtureSheet("aldric"), ref, { allTrees: false });
    expect(names(picker.available), "skills Aldric can take now").toEqual([
      "Broad Shoulders",
      "Longshot",
      "Stoneskin",
      "Thick Hide",
      "Twin Fangs",
      "Warden's Oath",
    ]);
    expect(names(picker.others), "the rest of Aldric's own trees, under their own heading").toEqual([
      "Battle Focus",
      "Blade Basics",
      "Cleave",
      "Iron Guard",
      "Oathbound",
      "Veteran's Edge",
      "Warden's Watch",
    ]);
  },
);

rule({ req: ["SK-1a"], m: "M2" }, "a new level 1 Warrior is offered his trees' starting skills first", () => {
  const picker = skillPicker(newWarrior(1), ref, { allTrees: false });
  expect(names(picker.available), "skills a new Warrior can take").toEqual(["Blade Basics", "Iron Guard"]);
  expect(names(picker.others), "the other skills in his trees, prestige tree included").toContain("Warden's Oath");
});

rule({ req: ["SK-1"], m: "M2" }, "switching to all trees adds other classes' skills, below the available ones", () => {
  const picker = skillPicker(fixtureSheet("aldric"), ref, { allTrees: true });
  expect(names(picker.available), "skills Aldric can take now, with all trees shown").toEqual([
    "Broad Shoulders",
    "Longshot",
    "Stoneskin",
    "Thick Hide",
    "Twin Fangs",
    "Warden's Oath",
  ]);
  expect(names(picker.others), "other classes' skills, among the rest").toEqual(
    expect.arrayContaining(["Spark", "Ward", "Shadow Step", "Veil"]),
  );
});

rule({ req: ["SK-1", "RD-3"], m: "M2" }, "retired skills are never offered in the picker", () => {
  const picker = skillPicker(fixtureSheet("isolde"), ref, { allTrees: true });
  const offered = [...names(picker.available), ...names(picker.others)];
  for (const retired of ["Glimmer", "Flicker", "Old Chant"]) {
    expect(offered, `the picker offering ${retired}`).not.toContain(retired);
  }
});

rule({ req: ["SK-1"], m: "M2" }, "searching by name narrows both lists, ignoring case", () => {
  const picker = skillPicker(fixtureSheet("aldric"), ref, { allTrees: false, query: "FANG" });
  expect(names(picker.available), "available skills matching FANG").toEqual(["Twin Fangs"]);
  expect(names(picker.others), "other skills matching FANG").toEqual([]);
});

rule({ req: ["SK-1a"], m: "M2" }, "the picker says how many times Aldric already has each skill", () => {
  const picker = skillPicker(fixtureSheet("aldric"), ref, { allTrees: false });
  const taken = Object.fromEntries([...picker.available, ...picker.others].map((o) => [o.skillId, o.taken]));
  expect(taken["veterans-edge"], "Veteran's Edge").toBe(3);
  expect(taken["iron-guard"], "Iron Guard").toBe(1);
  expect(taken["twin-fangs"], "Twin Fangs").toBe(0);
});

const reasons = (sheet: CharacterSheet, skillId: string) =>
  skillWarnings(sheet, ref, skillId)
    .map((w) => w.reason)
    .sort();

rule({ req: ["SK-3"], m: "M2" }, "a skill Aldric can take now gives no warnings", () => {
  expect(reasons(fixtureSheet("aldric"), "twin-fangs"), "warnings for Twin Fangs").toEqual([]);
});

rule(
  { req: ["SK-3"], m: "M2" },
  "a missing prerequisite warns and names it: Cleave needs Twin Fangs and Longshot",
  () => {
    const warnings = skillWarnings(fixtureSheet("aldric"), ref, "cleave");
    expect(
      warnings.map((w) => w.reason),
      "warnings for Cleave",
    ).toEqual(["missing-prerequisite"]);
    expect([...warnings[0]!.skillIds].sort(), "the missing prerequisites").toEqual(["longshot", "twin-fangs"]);
    expect(warnings[0]!.message, "the warning").toContain("Twin Fangs");
    expect(warnings[0]!.message, "the warning").toContain("Longshot");
  },
);

rule(
  { req: ["SK-3"], m: "M2" },
  "an either-or prerequisite is named as a choice: Oathbound needs Stoneskin, and Thick Hide or Broad Shoulders",
  () => {
    const [warning, ...rest] = skillWarnings(fixtureSheet("aldric"), ref, "oathbound");
    expect(rest, "other warnings for Oathbound").toEqual([]);
    expect(warning?.reason, "the warning for Oathbound").toBe("missing-prerequisite");
    expect(warning?.message, "the warning").toContain("Stoneskin");
    expect(warning?.message, "the warning").toMatch(/Thick Hide or Broad Shoulders/);
  },
);

rule({ req: ["SK-3"], m: "M2" }, "with Stoneskin and Thick Hide, Oathbound's either-or prerequisite is met", () => {
  const sheet = fixtureSheet("aldric");
  for (const skillId of ["stoneskin", "thick-hide"]) {
    sheet.entries.push({
      id: `x-${skillId}`,
      characterId: "aldric",
      category: "skills",
      skillId,
      howGained: "level-up",
      levelGained: 25,
      quantity: 1,
    });
  }
  expect(reasons(sheet, "oathbound"), "warnings for Oathbound").toEqual([]);
});

rule({ req: ["SK-3"], m: "M2" }, "a skill from another class's tree warns: Aldric adding Spark", () => {
  const warnings = skillWarnings(fixtureSheet("aldric"), ref, "spark");
  expect(
    warnings.map((w) => w.reason),
    "warnings for Spark",
  ).toEqual(["other-class"]);
  expect(warnings[0]!.message, "the warning").toContain("Arcana");
});

rule(
  { req: ["SK-3"], m: "M2" },
  "a level below the tree's entry level warns: Brin (8) adding Warden's Oath (21)",
  () => {
    const warnings = skillWarnings(fixtureSheet("brin"), ref, "wardens-oath");
    expect(
      warnings.map((w) => w.reason),
      "warnings for Warden's Oath",
    ).toEqual(["below-entry-level"]);
    expect(warnings[0]!.message, "the warning").toContain("21");
  },
);

rule({ req: ["SK-3"], m: "M2" }, "taking a skill again warns only above its limit", () => {
  const aldric = fixtureSheet("aldric");
  expect(reasons(aldric, "iron-guard"), "a second Iron Guard (limit 1)").toEqual(["already-taken"]);
  expect(reasons(aldric, "veterans-edge"), "a fourth Veteran's Edge (limit 3)").toEqual(["already-taken"]);
  aldric.entries.push({
    id: "x-hide",
    characterId: "aldric",
    category: "skills",
    skillId: "thick-hide",
    howGained: "level-up",
    levelGained: 23,
    quantity: 1,
  });
  expect(reasons(aldric, "thick-hide"), "a second Thick Hide (limit 3)").toEqual([]);
  const warning = skillWarnings(fixtureSheet("aldric"), ref, "iron-guard")[0]!;
  expect(warning.message, "the warning for a second Iron Guard").toContain("Iron Guard");
});

rule(
  { req: ["SK-3"], m: "M2" },
  "several problems give several warnings: Isolde (Mage 13) adding Warden's Watch",
  () => {
    expect(reasons(fixtureSheet("isolde"), "wardens-watch"), "warnings for Warden's Watch").toEqual([
      "below-entry-level",
      "missing-prerequisite",
      "other-class",
    ]);
  },
);

rule(
  { req: ["SK-6"], m: "M4" },
  "the record check lists Aldric's levels where the chart gives a skill but none was recorded",
  () => {
    const missing = recordCheck(fixtureSheet("aldric"), ref);
    expect(
      missing.map((m) => m.level),
      "Aldric's levels with no skill recorded",
    ).toEqual([3, 7, 9, 13, 15, 19, 23, 25]);
    expect(missing[0]!.message, "the first notice").toBe("Level 3: no skill recorded");
  },
);

rule(
  { req: ["SK-6"], m: "M4" },
  "the record check follows the class's chart: Isolde (Mage) gains a skill every level",
  () => {
    const missing = recordCheck(fixtureSheet("isolde"), ref);
    expect(
      missing.map((m) => m.level),
      "Isolde's levels with no skill recorded",
    ).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
  },
);
