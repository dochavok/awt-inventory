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

rule({ req: ["SK-1a"], m: "M2" }, "a starting skill of his own trees is available even with a prerequisite", () => {
  const withPrerequisite = testReferenceData();
  withPrerequisite.skills.find((s) => s.id === "iron-guard")!.prerequisites = { skill: "blade-basics" };
  const picker = skillPicker(newWarrior(1), withPrerequisite, { allTrees: false });
  expect(names(picker.available), "skills a new Warrior can take").toContain("Iron Guard");
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

// Moonlit Step is one card in two trees: a starting skill in Arcana (Mage), and
// in Shadowcraft (Rogue) after Quick Fingers.

function withSkill(sheet: CharacterSheet, skillId: string): CharacterSheet {
  sheet.entries.push({
    id: `x-${skillId}`,
    characterId: sheet.character.id,
    category: "skills",
    skillId,
    howGained: "level-up",
    levelGained: sheet.character.level,
    quantity: 1,
  });
  return sheet;
}

const moonlit = (picker: ReturnType<typeof skillPicker>) => ({
  available: picker.available.filter((o) => o.skillId === "moonlit-step"),
  others: picker.others.filter((o) => o.skillId === "moonlit-step"),
});

rule(
  { req: ["SK-1a", "SK-1"], m: "M2" },
  "a skill in several trees is listed once, and is available if any of its trees allows it",
  () => {
    const isolde = moonlit(skillPicker(fixtureSheet("isolde"), ref, { allTrees: true }));
    expect(
      [isolde.available.length, isolde.others.length],
      "Moonlit Step in Isolde's lists (available, others)",
    ).toEqual([1, 0]);
    expect(isolde.available[0]!.tree, "the tree that lets Isolde take Moonlit Step").toBe("arcana");

    const brin = moonlit(skillPicker(fixtureSheet("brin"), ref, { allTrees: true }));
    expect([brin.available.length, brin.others.length], "Moonlit Step in Brin's lists, without Quick Fingers").toEqual([
      0, 1,
    ]);
    const ready = moonlit(skillPicker(withSkill(fixtureSheet("brin"), "quick-fingers"), ref, { allTrees: true }));
    expect([ready.available.length, ready.others.length], "Moonlit Step in Brin's lists, with Quick Fingers").toEqual([
      1, 0,
    ]);
    expect(ready.available[0]!.tree, "the tree that lets Brin take Moonlit Step").toBe("shadowcraft");
  },
);

rule({ req: ["SK-1"], m: "M2" }, "a skill in several trees is in a character's own list if any tree is his", () => {
  const offered = (sheet: CharacterSheet) => {
    const picker = moonlit(skillPicker(sheet, ref, { allTrees: false }));
    return picker.available.length + picker.others.length;
  };
  expect(offered(fixtureSheet("isolde")), "Moonlit Step in Isolde's own trees (Arcana)").toBe(1);
  expect(offered(fixtureSheet("brin")), "Moonlit Step in Brin's own trees (Shadowcraft)").toBe(1);
  expect(offered(fixtureSheet("aldric")), "Moonlit Step in Aldric's own trees (neither)").toBe(0);
});

rule(
  { req: ["SK-1a", "SK-3"], m: "M2" },
  "a skill in two of a character's own trees is available when the second allows it",
  () => {
    // An edited list: Moonlit Step in Bladework (after Twin Fangs, which Aldric lacks) and Bulwark (no prerequisite).
    const edited = testReferenceData();
    edited.skills.find((s) => s.id === "moonlit-step")!.trees = [
      { tree: "bladework", prerequisites: { skill: "twin-fangs" } },
      { tree: "bulwark" },
    ];
    const picker = moonlit(skillPicker(fixtureSheet("aldric"), edited, { allTrees: false }));
    expect(
      picker.available.map((o) => o.tree),
      "the tree that lets Aldric take Moonlit Step",
    ).toEqual(["bulwark"]);
    expect(picker.others, "Moonlit Step among Aldric's other skills").toEqual([]);
    expect(skillWarnings(fixtureSheet("aldric"), edited, "moonlit-step"), "Aldric's warnings").toEqual([]);
  },
);

rule(
  { req: ["SK-1a", "SK-3"], m: "M2" },
  "a skill in several trees already taken is no longer available, and warns once that it's taken",
  () => {
    const isolde = withSkill(fixtureSheet("isolde"), "moonlit-step");
    const picker = moonlit(skillPicker(isolde, ref, { allTrees: true }));
    expect([picker.available.length, picker.others.length], "Moonlit Step in Isolde's lists once she has it").toEqual([
      0, 1,
    ]);
    expect(picker.others[0]!.taken, "how many times Isolde has Moonlit Step").toBe(1);
    expect(
      skillWarnings(isolde, ref, "moonlit-step").map((w) => w.reason),
      "Isolde's warnings for a second Moonlit Step",
    ).toEqual(["already-taken"]);
  },
);

rule(
  { req: ["SK-1a", "SK-3"], m: "M2" },
  "the tree the picker names for an available skill is the one with no warnings, if one has none",
  () => {
    // An edited list: Moonlit Step starts Bladework but needs Twin Fangs there (Aldric lacks it),
    // and needs nothing in Bulwark.
    const edited = testReferenceData();
    edited.skills.find((s) => s.id === "moonlit-step")!.trees = [
      { tree: "bladework", starting: true, prerequisites: { skill: "twin-fangs" } },
      { tree: "bulwark" },
    ];
    const picker = moonlit(skillPicker(fixtureSheet("aldric"), edited, { allTrees: false }));
    expect(
      picker.available.map((o) => o.tree),
      "the tree the picker names for Moonlit Step",
    ).toEqual(["bulwark"]);
    expect(skillWarnings(fixtureSheet("aldric"), edited, "moonlit-step"), "Aldric's warnings").toEqual([]);
  },
);

rule({ req: ["SK-1", "RD-3"], m: "M2" }, "a retired tree no longer makes a skill in several trees available", () => {
  const retired = testReferenceData();
  retired.trees.find((t) => t.id === "arcana")!.retired = true;
  const isolde = moonlit(skillPicker(fixtureSheet("isolde"), retired, { allTrees: true }));
  expect([isolde.available.length, isolde.others.length], "Moonlit Step in Isolde's lists with Arcana retired").toEqual(
    [0, 1],
  );
  const own = moonlit(skillPicker(fixtureSheet("isolde"), retired, { allTrees: false }));
  expect(own.available.length + own.others.length, "Moonlit Step in Isolde's own trees with Arcana retired").toBe(0);
});

rule({ req: ["SK-3"], m: "M2" }, "a skill in several trees gives the warnings of the tree with the fewest", () => {
  expect(reasons(fixtureSheet("isolde"), "moonlit-step"), "Isolde's warnings (Arcana: none)").toEqual([]);
  // Aldric: Arcana gives one warning (another class), Shadowcraft two (another class, Quick Fingers).
  const aldric = skillWarnings(fixtureSheet("aldric"), ref, "moonlit-step");
  expect(
    aldric.map((w) => w.reason),
    "Aldric's warnings for Moonlit Step",
  ).toEqual(["other-class"]);
  expect(aldric[0]!.message, "Aldric's warning").toContain("Arcana");
});

rule(
  { req: ["SK-3"], m: "M2" },
  "when a skill's trees tie on warnings, the tree open to the character's class is used",
  () => {
    // Brin: Arcana gives one warning (another class), Shadowcraft one (Quick Fingers missing).
    const brin = skillWarnings(fixtureSheet("brin"), ref, "moonlit-step");
    expect(
      brin.map((w) => [w.reason, w.skillIds]),
      "Brin's warnings for Moonlit Step",
    ).toEqual([["missing-prerequisite", ["quick-fingers"]]]);
    // The same tie with Shadowcraft listed first gives the same answer.
    const swapped = testReferenceData();
    const step = swapped.skills.find((s) => s.id === "moonlit-step")!;
    step.trees = [...step.trees!].reverse();
    expect(
      skillWarnings(fixtureSheet("brin"), swapped, "moonlit-step").map((w) => w.reason),
      "Brin's warnings with Shadowcraft listed first",
    ).toEqual(["missing-prerequisite"]);
  },
);

rule(
  { req: ["SK-3"], m: "M2" },
  "when trees tie and none is the character's class's, the skill list's order decides",
  () => {
    // Aldric (Warrior) with an edited list: Moonlit Step in Shadowcraft (needs Quick Fingers)
    // and Arcana (needs Spark): each gives two warnings, another class and a prerequisite.
    const edited = testReferenceData();
    const step = edited.skills.find((s) => s.id === "moonlit-step")!;
    step.trees = [
      { tree: "shadowcraft", prerequisites: { skill: "quick-fingers" } },
      { tree: "arcana", prerequisites: { skill: "spark" } },
    ];
    const first = skillWarnings(fixtureSheet("aldric"), edited, "moonlit-step");
    expect(
      first.flatMap((w) => w.skillIds),
      "skills named in Aldric's warnings, Shadowcraft first",
    ).toEqual(["quick-fingers", "moonlit-step"]);
    step.trees.reverse();
    const second = skillWarnings(fixtureSheet("aldric"), edited, "moonlit-step");
    expect(
      second.flatMap((w) => w.skillIds),
      "skills named in Aldric's warnings, Arcana first",
    ).toEqual(["spark", "moonlit-step"]);
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

rule(
  { req: ["SK-1", "SE-1"], m: "M3" },
  "the picker's search ignores accents and finds each word typed anywhere in a word of the name",
  () => {
    const search = (query: string) => {
      const picker = skillPicker(fixtureSheet("aldric"), ref, { allTrees: false, query });
      return [...names(picker.available), ...names(picker.others)];
    };
    expect(search("fángs twin"), "Aldric's skills matching 'fángs twin'").toEqual(["Twin Fangs"]);
    expect(search("TWIN  an"), "Aldric's skills matching 'TWIN  an'").toEqual(["Twin Fangs"]);
    expect(search("fang shield"), "Aldric's skills matching 'fang shield'").toEqual([]);
  },
);

rule(
  { req: ["SK-1", "SE-1"], m: "M3" },
  "in the picker, skills where every word typed starts a word come first, then the rest, each by name",
  () => {
    // For Isolde, a Mage, these Warrior and Rogue skills are all in the other list.
    const picker = skillPicker(fixtureSheet("isolde"), ref, { allTrees: true, query: "sh" });
    // In the picker's own order: `names` sorts.
    expect(picker.available, "Isolde's available skills matching 'sh'").toEqual([]);
    expect(
      picker.others.map((o) => o.name),
      "Isolde's other skills matching 'sh'",
    ).toEqual(["Broad Shoulders", "Shadow Step", "Longshot"]);
  },
);
