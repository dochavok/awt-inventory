// Grants and totals (section 8: GR-1 to GR-12), in the rules core.
// The scenarios in tests/scenarios/totals.yaml, plus checks a scenario can't
// express: each grant line's category and source details (GR-12), and that the
// level chart is read rather than built in (TF-3).

import { expect } from "vitest";
import { computeTotals, slotState, type Grant, type SkillEntry, type SourceRef } from "../../src/rules";
import { fixtureSheet, testReferenceData } from "../support/fixtures";
import { rule } from "../support/rule";
import { runScenarios } from "../support/scenarios";

runScenarios("totals.yaml");

rule({ req: ["GR-12"], m: "M4" }, "each grant in Aldric's CM names its source, its category and the amount", () => {
  const totals = computeTotals(fixtureSheet("aldric"), testReferenceData());
  const line = (name: string) =>
    totals.cm.grants.find(
      (g) => g.source.type !== "level-chart" && g.source.type !== "manual" && g.source.name === name,
    );

  expect(line("Ironclad Plate"), "Ironclad Plate's line").toMatchObject({
    group: "armor",
    amount: 30,
    source: { type: "entry", id: "aldric-plate", category: "armor" },
  });
  expect(line("Duskfang"), "Duskfang's line").toMatchObject({
    group: "weapons",
    amount: 15,
    source: { type: "entry", id: "aldric-sword", category: "weapons" },
  });
  expect(line("Grey Fang"), "Grey Fang's line").toMatchObject({
    group: "ally",
    amount: 10,
    source: { type: "entry", id: "aldric-wolf", category: "allies" },
  });
  expect(line("Iron Guard"), "Iron Guard's line").toMatchObject({
    group: "skills",
    amount: 2,
    source: { type: "skill", skillId: "iron-guard" },
  });
  expect(
    totals.cm.grants.filter((g) => g.source.type === "level-chart"),
    "the class bonus line in Aldric's CM",
  ).toEqual([{ source: { type: "level-chart" }, group: "class-bonus", amount: 63 }]);
});

rule(
  { req: ["GR-12", "GR-4"], m: "M4" },
  "a situational grant is listed under each total it would affect, and only those",
  () => {
    const sheet = fixtureSheet("aldric");
    sheet.manualGrants.push({
      id: "m-blessing",
      reason: "Shrine blessing",
      grants: [
        { id: "g-bless-cm", kind: "cm", amount: 4, condition: "vs Evil" },
        { id: "g-bless-mit", kind: "mitigation", amount: 1, condition: "vs Evil" },
      ],
    });
    const totals = computeTotals(sheet, testReferenceData());
    const reasons = (list: typeof totals.cm.situational) =>
      list.flatMap((g) => (g.source.type === "manual" ? [`${g.source.reason} ${g.amount} ${g.condition}`] : []));

    expect(reasons(totals.cm.situational), "situational lines under Aldric's CM").toEqual([
      "Shrine blessing 4 vs Evil",
    ]);
    expect(reasons(totals.mitigation.situational), "situational lines under Aldric's mitigation").toEqual([
      "Shrine blessing 1 vs Evil",
    ]);
    expect(reasons(totals.hearts.situational), "situational lines under Aldric's max hearts").toEqual([]);
    expect(totals.cm.value, "Aldric's CM").toBe(170);
    expect(totals.mitigation.value, "Aldric's mitigation").toBe(3);
  },
);

rule(
  { req: ["GR-4", "GR-12"], m: "M4" },
  "a grant whose condition is blank counts, and its line has no condition",
  () => {
    const sheet = fixtureSheet("aldric");
    sheet.manualGrants.push({
      id: "m-blank",
      reason: "Cleared box",
      grants: [{ id: "g-blank", kind: "cm", amount: 5, condition: " " }],
    });
    const totals = computeTotals(sheet, testReferenceData());
    expect(totals.cm.value, "Aldric's CM with a +5 whose condition is blank").toBe(175);
    const line = totals.cm.grants.find((g) => g.source.type === "manual" && g.source.reason === "Cleared box");
    expect(line && "condition" in line, "the blank-condition line carries a condition").toBe(false);
  },
);

rule(
  { req: ["GR-1", "GR-5"], m: "M4" },
  "a grant amount that isn't a number in bad data is left out of Aldric's totals",
  () => {
    const sheet = fixtureSheet("aldric");
    sheet.manualGrants.push({
      id: "m-bad",
      reason: "Bad data",
      grants: [
        { id: "g-nan", kind: "cm", amount: Number.NaN },
        { id: "g-inf", kind: "mitigation", amount: Number.POSITIVE_INFINITY },
      ],
    });
    const totals = computeTotals(sheet, testReferenceData());
    expect([totals.cm.value, totals.mitigation.value], "Aldric's CM and mitigation").toEqual([170, 3]);
    expect(
      [...totals.cm.grants, ...totals.mitigation.grants].some((g) => g.source.type === "manual"),
      "a line from the bad grant",
    ).toBe(false);
  },
);

rule({ req: ["GR-4", "GR-12"], m: "M4" }, "a situational grant's condition is listed without stray spaces", () => {
  const sheet = fixtureSheet("aldric");
  sheet.manualGrants.push({
    id: "m-spaced",
    reason: "Spaced",
    grants: [{ id: "g-spaced", kind: "cm", amount: 2, condition: "  vs Evil  " }],
  });
  const line = computeTotals(sheet, testReferenceData()).cm.situational.find(
    (g) => g.source.type === "manual" && g.source.reason === "Spaced",
  );
  expect(line?.condition, "the condition on Aldric's spaced situational grant").toBe("vs Evil");
});

/** The test chart with Rogue level 8 given Stealth Bonus dice, as the real chart has from level 10. */
function rogueDiceChart(): ReturnType<typeof testReferenceData> {
  const ref = testReferenceData();
  const row = ref.levelChart.Rogue.levels.find((l) => l.level === 8)!;
  row.classBonusDice = "1d4";
  row.dice = "1d20 + 1d4";
  return ref;
}

rule(
  { req: ["GR-7", "GR-8", "GR-11"], q: ["Q12"], m: "M4" },
  "a Rogue's Stealth Bonus dice: the number counts in CM, the dice are rolled with the combat dice",
  () => {
    const totals = computeTotals(fixtureSheet("brin"), rogueDiceChart());
    expect(totals.classBonus, "Brin's class bonus").toEqual({ name: "Stealth Bonus", value: 16, dice: "1d4" });
    expect(
      totals.cm.grants.filter((g) => g.source.type === "level-chart"),
      "the class bonus line in Brin's CM",
    ).toEqual([{ source: { type: "level-chart" }, group: "class-bonus", amount: 16 }]);
    expect(totals.cm.value, "Brin's CM").toBe(16);
    expect(totals.dice.base, "Brin's combat dice from the chart").toBe("1d20 + 1d4");
    expect(totals.dice.extra[0], "Brin's first extra die").toEqual({ die: "1d4", source: { type: "level-chart" } });
  },
);

rule({ req: ["GR-7", "GR-11"], m: "M4" }, "a class bonus without dice adds no die", () => {
  const totals = computeTotals(fixtureSheet("brin"), testReferenceData());
  expect(totals.classBonus, "Brin's class bonus on the plain chart").toEqual({ name: "Stealth Bonus", value: 16 });
  expect(totals.dice.extra, "Brin's extra dice on the plain chart").toEqual([]);
});

/** Isolde (Mage 13) with the given Cinder skills from the test skill list. */
function isoldeWith(...skillIds: string[]) {
  const sheet = fixtureSheet("isolde");
  for (const skillId of skillIds) {
    sheet.entries.push({
      id: `x-${skillId}`,
      characterId: "isolde",
      category: "skills",
      skillId,
      howGained: "level-up",
      levelGained: 13,
      quantity: 1,
    });
  }
  return sheet;
}

/** Lines and dice from skills, as "Name amount-or-die condition". */
const fromSkills = (lines: { source: SourceRef; amount?: number; die?: string; condition?: string }[]) =>
  lines.flatMap((l) =>
    l.source.type === "skill" ? [`${l.source.name} ${l.amount ?? l.die} ${l.condition ?? ""}`.trim()] : [],
  );

rule(
  { req: ["GR-1", "GR-9", "GR-12"], m: "M4" },
  "within a group only the largest grant counts, and the smaller isn't listed",
  () => {
    const before = computeTotals(fixtureSheet("isolde"), testReferenceData()).mitigation.value;
    const totals = computeTotals(isoldeWith("cinder-mark-i", "cinder-mark-ii"), testReferenceData());
    expect(totals.mitigation.value - before, "what the Cinder Marks add to Isolde's mitigation").toBe(2);
    expect(fromSkills(totals.mitigation.grants), "skill lines in Isolde's mitigation").toEqual(["Cinder Mark II 2"]);
    expect(fromSkills(totals.cm.situational), "skill lines under Isolde's CM, situational").toEqual([
      "Cinder Mark II 5 vs Undead",
    ]);
    expect(fromSkills(totals.dice.situational), "Isolde's situational dice from skills").toEqual([
      "Cinder Mark II 1d8 when a spell adds the Cinder Die",
    ]);
    expect(fromSkills(totals.dice.extra), "Isolde's extra dice from skills").toEqual([]);
    const alone = computeTotals(isoldeWith("cinder-mark-i"), testReferenceData());
    expect(alone.mitigation.value - before, "what Cinder Mark I alone adds").toBe(1);
  },
);

rule({ req: ["GR-1", "GR-11"], m: "M4" }, "the largest die in a group is the one with the highest roll", () => {
  const ref = testReferenceData();
  const first = ref.skillGrants.find((g) => g.skill === "cinder-mark-i")!.grants[0]!;
  if (first.kind === "die") first.die = "2d6";
  const totals = computeTotals(isoldeWith("cinder-mark-ii", "cinder-mark-i"), ref);
  expect(fromSkills(totals.dice.situational), "Isolde's situational dice with 2d6 against 1d8").toEqual([
    "Cinder Mark I 2d6 when a spell adds the Cinder Die",
  ]);
});

rule(
  { req: ["GR-1", "GR-4", "GR-11"], m: "M4" },
  "a skill that makes a group's die always count lists its largest die among the combat dice, with its source",
  () => {
    const totals = computeTotals(isoldeWith("cinder-mark-i", "cinder-mark-ii", "cinder-focus"), testReferenceData());
    expect(
      totals.dice.extra.filter((d) => d.source.type === "skill"),
      "Isolde's extra dice from skills",
    ).toEqual([
      {
        die: "1d8",
        source: { type: "skill", id: "x-cinder-mark-ii", name: "Cinder Mark II", skillId: "cinder-mark-ii" },
      },
    ]);
    expect(fromSkills(totals.dice.situational), "Isolde's situational dice from skills").toEqual([]);
    expect(fromSkills(totals.cm.situational), "the vs Undead bonus stays situational").toEqual([
      "Cinder Mark II 5 vs Undead",
    ]);
  },
);

rule(
  { req: ["GR-1", "GR-4"], m: "M4" },
  "die-always makes only its group's die count, not a bonus in that group",
  () => {
    const ref = testReferenceData();
    // An edited list: Cinder Mark II's vs Undead bonus put in the Cinder Die's group.
    const bonus = ref.skillGrants.find((g) => g.skill === "cinder-mark-ii")!.grants[1]!;
    if (bonus.kind === "cm") bonus.group = "cinder-die";
    const totals = computeTotals(isoldeWith("cinder-mark-ii", "cinder-focus"), ref);
    expect(fromSkills(totals.cm.situational), "Isolde's situational CM from skills").toEqual([
      "Cinder Mark II 5 vs Undead",
    ]);
    expect(fromSkills(totals.cm.grants), "Isolde's CM lines from skills (her Ward only)").toEqual(["Ward 2"]);
    expect(fromSkills(totals.dice.extra), "Isolde's extra dice from skills").toEqual(["Cinder Mark II 1d8"]);
  },
);

rule(
  { req: ["GR-1", "GR-11"], m: "M4" },
  "another skill's own die, outside the group, is added alongside the group's largest",
  () => {
    // Warden's Watch gives its own 1d6, in no group.
    const situational = computeTotals(isoldeWith("cinder-mark-ii", "wardens-watch"), testReferenceData());
    expect(fromSkills(situational.dice.extra), "Isolde's extra dice from skills").toEqual(["Warden's Watch 1d6"]);
    expect(fromSkills(situational.dice.situational), "Isolde's situational dice from skills").toEqual([
      "Cinder Mark II 1d8 when a spell adds the Cinder Die",
    ]);
    const always = computeTotals(isoldeWith("cinder-mark-ii", "wardens-watch", "cinder-focus"), testReferenceData());
    expect(fromSkills(always.dice.extra), "Isolde's extra dice with Cinder Focus").toEqual([
      "Cinder Mark II 1d8",
      "Warden's Watch 1d6",
    ]);
  },
);

rule(
  { req: ["GR-1", "GR-2"], m: "M4" },
  "groups and die-always count only from the skill list: on an entry, title or manual grant they're ignored",
  () => {
    // Bad data, as if written past the app's checks: grouped grants and die-always on Isolde's own sources.
    const sheet = isoldeWith("cinder-mark-ii");
    const orb = sheet.entries.find((e) => e.id === "isolde-orb")!;
    if (orb.category === "items") {
      orb.grants = [
        ...(orb.grants ?? []),
        { id: "g-orb-die", kind: "die", die: "1d12", condition: "made up", group: "cinder-die" } as Grant,
      ];
    }
    sheet.titles.push({
      id: "t-x-cinder",
      name: "Made-up Title",
      scope: { level: "player" },
      grants: [{ id: "g-t-mit", kind: "mitigation", amount: 1, group: "cinder-ward" } as Grant],
    });
    sheet.manualGrants.push({
      id: "m-x-always",
      reason: "Made-up ruling",
      grants: [{ id: "g-m-always", kind: "die-always", group: "cinder-die" } as unknown as Grant],
    });
    const before = computeTotals(isoldeWith("cinder-mark-ii"), testReferenceData());
    const totals = computeTotals(sheet, testReferenceData());
    expect(fromSkills(totals.dice.situational), "Isolde's situational dice from skills").toEqual([
      "Cinder Mark II 1d8 when a spell adds the Cinder Die",
    ]);
    expect(
      totals.dice.situational.filter((d) => d.source.type === "entry").map((d) => d.die),
      "Isolde's situational dice from the Glass Orb",
    ).toEqual(["1d12"]);
    expect(fromSkills(totals.dice.extra), "Isolde's extra dice from skills").toEqual([]);
    expect(totals.mitigation.value, "Isolde's mitigation with the title's +1").toBe(before.mitigation.value + 1);
    expect(fromSkills(totals.mitigation.grants), "Isolde's mitigation lines from skills").toEqual(["Cinder Mark II 2"]);
  },
);

rule({ req: ["GR-1", "GR-9", "GR-12"], m: "M4" }, "the largest in a group wins whatever order it was added in", () => {
  const before = computeTotals(fixtureSheet("isolde"), testReferenceData()).mitigation.value;
  const totals = computeTotals(isoldeWith("cinder-mark-ii", "cinder-mark-i"), testReferenceData());
  expect(totals.mitigation.value - before, "what the Cinder Marks add, Mark II added first").toBe(2);
  expect(fromSkills(totals.mitigation.grants), "skill lines in Isolde's mitigation").toEqual(["Cinder Mark II 2"]);
  expect(fromSkills(totals.cm.situational), "skill lines under Isolde's CM, situational").toEqual([
    "Cinder Mark II 5 vs Undead",
  ]);
  expect(fromSkills(totals.dice.situational), "Isolde's situational dice from skills").toEqual([
    "Cinder Mark II 1d8 when a spell adds the Cinder Die",
  ]);
});

rule({ req: ["GR-1", "GR-11"], m: "M4" }, "the largest die is by highest roll, not average: 1d10 beats 3d3", () => {
  const ref = testReferenceData();
  const dieOf = (skill: string) => ref.skillGrants.find((g) => g.skill === skill)!.grants[0]!;
  const [first, second] = [dieOf("cinder-mark-i"), dieOf("cinder-mark-ii")];
  if (first.kind === "die") first.die = "1d10";
  if (second.kind === "die") second.die = "3d3";
  const totals = computeTotals(isoldeWith("cinder-mark-i", "cinder-mark-ii"), ref);
  expect(fromSkills(totals.dice.situational), "Isolde's situational dice with 1d10 against 3d3").toEqual([
    "Cinder Mark I 1d10 when a spell adds the Cinder Die",
  ]);
});

rule(
  { req: ["GR-1", "GR-8", "GR-10"], m: "M4" },
  "groups apply to CM and hearts that count, not only situational ones",
  () => {
    const ref = testReferenceData();
    for (const [skill, cm, hearts] of [
      ["cinder-mark-i", 2, 1],
      ["cinder-mark-ii", 5, 3],
    ] as const) {
      const grants = ref.skillGrants.find((g) => g.skill === skill)!.grants;
      const bonus = grants[1]!;
      if (bonus.kind === "cm") delete bonus.condition;
      grants.push({ id: `sg-x-${skill}-hearts`, kind: "hearts", amount: hearts, group: "cinder-heart" });
      expect(bonus, `${skill}'s CM bonus`).toMatchObject({ amount: cm });
    }
    const before = computeTotals(fixtureSheet("isolde"), ref);
    const totals = computeTotals(isoldeWith("cinder-mark-i", "cinder-mark-ii"), ref);
    expect(totals.cm.value - before.cm.value, "what the Cinder Marks add to Isolde's CM").toBe(5);
    expect(totals.hearts.value - before.hearts.value, "what the Cinder Marks add to Isolde's max hearts").toBe(3);
    expect(fromSkills(totals.hearts.grants), "skill lines in Isolde's max hearts").toEqual(["Cinder Mark II 3"]);
  },
);

rule(
  { req: ["GR-1", "EQ-5"], m: "M4" },
  "a group's slot grants for different slot kinds, or allowances for different rarities, don't replace each other",
  () => {
    // An edited list: the Cinder Marks also give grouped slots and allowances, each for something different.
    const ref = testReferenceData();
    const grantsOf = (skill: string) => ref.skillGrants.find((g) => g.skill === skill)!.grants;
    grantsOf("cinder-mark-i").push(
      { id: "sg-x-neck", kind: "slots", slotKind: "neck", amount: 1, group: "cinder-gift" },
      { id: "sg-x-cursed", kind: "allowance", rarity: "cursed", amount: 1, group: "cinder-gift" },
    );
    grantsOf("cinder-mark-ii").push(
      { id: "sg-x-back", kind: "slots", slotKind: "back", amount: 2, group: "cinder-gift" },
      { id: "sg-x-legendary", kind: "allowance", rarity: "legendary", amount: 2, group: "cinder-gift" },
    );
    const sheet = isoldeWith("cinder-mark-i", "cinder-mark-ii");
    const before = slotState(isoldeWith(), ref);
    const after = slotState(sheet, ref);
    const allowed = (s: typeof after, kind: string) => s.kinds.find((k) => k.kind === kind)!.allowed;
    const rarity = (s: typeof after, id: string) => s.rarities.find((r) => r.rarity === id)?.allowed;
    expect(allowed(after, "neck") - allowed(before, "neck"), "Isolde's extra Neck slots").toBe(1);
    expect(allowed(after, "back") - allowed(before, "back"), "Isolde's extra Back slots").toBe(2);
    expect((rarity(after, "cursed") ?? 0) - (rarity(before, "cursed") ?? 0), "Isolde's extra Cursed allowance").toBe(1);
    expect(
      (rarity(after, "legendary") ?? 0) - (rarity(before, "legendary") ?? 0),
      "Isolde's extra Legendary allowance",
    ).toBe(2);
  },
);

rule(
  { req: ["GR-1", "EQ-5"], m: "M4" },
  "a group's slot grants for the same slot kind, or allowances for the same rarity, keep only the largest",
  () => {
    const ref = testReferenceData();
    const grantsOf = (skill: string) => ref.skillGrants.find((g) => g.skill === skill)!.grants;
    grantsOf("cinder-mark-i").push(
      { id: "sg-x-neck-1", kind: "slots", slotKind: "neck", amount: 1, group: "cinder-gift" },
      { id: "sg-x-legendary-1", kind: "allowance", rarity: "legendary", amount: 1, group: "cinder-gift" },
    );
    grantsOf("cinder-mark-ii").push(
      { id: "sg-x-neck-2", kind: "slots", slotKind: "neck", amount: 2, group: "cinder-gift" },
      { id: "sg-x-legendary-2", kind: "allowance", rarity: "legendary", amount: 2, group: "cinder-gift" },
    );
    const before = slotState(isoldeWith(), ref);
    const after = slotState(isoldeWith("cinder-mark-i", "cinder-mark-ii"), ref);
    const neck = (s: typeof after) => s.kinds.find((k) => k.kind === "neck")!.allowed;
    const legendary = (s: typeof after) => s.rarities.find((r) => r.rarity === "legendary")?.allowed ?? 0;
    expect(neck(after) - neck(before), "Isolde's extra Neck slots (the larger only)").toBe(2);
    expect(legendary(after) - legendary(before), "Isolde's extra Legendary allowance (the larger only)").toBe(2);
  },
);

rule({ req: ["GR-1", "GR-11"], m: "M4" }, "die-always adds nothing without a die in its group", () => {
  const totals = computeTotals(isoldeWith("cinder-focus"), testReferenceData());
  expect(totals.dice.extra, "Isolde's extra dice with only Cinder Focus").toEqual([]);
  expect(totals.dice.situational, "Isolde's situational dice with only Cinder Focus").toEqual([]);
});

rule({ req: ["GR-1", "GR-11"], m: "M4" }, "die-always from two sources still lists the group's die once", () => {
  const sheet = isoldeWith("cinder-mark-ii", "cinder-focus");
  sheet.entries.push({ ...(sheet.entries.at(-1) as SkillEntry), id: "x-cinder-focus-2" });
  const totals = computeTotals(sheet, testReferenceData());
  expect(fromSkills(totals.dice.extra), "Isolde's extra dice from skills").toEqual(["Cinder Mark II 1d8"]);
});

rule(
  { req: ["GR-7", "TF-3"], m: "M4" },
  "the class bonus comes from the reference data passed in, not a built-in chart",
  () => {
    const ref = testReferenceData();
    const row = ref.levelChart.Warrior.levels.find((l) => l.level === 25)!;
    row.classBonus = 99;
    const totals = computeTotals(fixtureSheet("aldric"), ref);
    expect(totals.classBonus, "Aldric's class bonus with an edited chart").toEqual({ name: "Combat Bonus", value: 99 });
    expect(totals.cm.value, "Aldric's CM with an edited chart").toBe(206);
  },
);
