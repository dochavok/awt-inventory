/* eslint-disable @typescript-eslint/no-explicit-any -- these tests edit raw YAML of any shape to make broken copies */
// Reference data (section 13: RD-1 to RD-8): reading the files and the CI
// checks on them. Uses the test copy in tests/fixtures/refdata/, and broken
// copies made from it inside each test; never the real files, except the
// RD-6 and RD-8 checks on data/ itself (and RD-8's check that the tests'
// made-up data isn't taken from data/).

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect } from "vitest";
import { parse, stringify } from "yaml";
import { levelCap, loadReferenceData, validateReferenceData, type ReferenceFiles } from "../../src/refdata";
import { rule } from "../support/rule";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readReferenceData } from "../../build/reference-data";

const FIXTURES = new URL("../fixtures/refdata/", import.meta.url);
const DATA = new URL("../../data/", import.meta.url);

function readFiles(dir: URL): ReferenceFiles {
  const path = fileURLToPath(dir);
  return Object.fromEntries(
    readdirSync(path)
      .filter((f) => f.endsWith(".yaml"))
      .map((f) => [f, readFileSync(new URL(f, dir), "utf8")]),
  );
}

const testFiles = () => readFiles(FIXTURES);

/** A copy of the test files with one file's parsed content changed. */
function edited(file: string, change: (data: any) => void): ReferenceFiles {
  const files = testFiles();
  const data = parse(files[file]!);
  change(data);
  return { ...files, [file]: stringify(data) };
}

const problemsFor = (files: ReferenceFiles, released?: ReferenceFiles) =>
  validateReferenceData(files, released).map((p) => `${p.file}${p.id ? ` ${p.id}` : ""}: ${p.message}`);

rule({ req: ["RD-1", "RD-4"], m: "M2" }, "the test copy of the reference data loads, and has no problems", () => {
  expect(problemsFor(testFiles()), "problems in the test reference data").toEqual([]);
  const ref = loadReferenceData(testFiles());
  expect(ref.levelChart.Warrior.levels.find((l) => l.level === 25)?.classBonus, "Warrior 25's class bonus").toBe(63);
  expect(ref.levelChart.Mage.startingArcaneSlots, "a Mage's starting arcane slots").toBe(3);
  expect(
    ref.slotKinds.map((k) => k.id),
    "slot kinds",
  ).toContain("tail");
  expect(
    ref.rarities.find((r) => r.id === "cursed"),
    "the Cursed rarity",
  ).toMatchObject({ limit: 2, minLevel: 10 });
  expect(ref.skills.find((s) => s.id === "cleave")?.prerequisites, "Cleave's prerequisites").toEqual({
    all: [{ skill: "twin-fangs" }, { skill: "longshot" }],
  });
  expect(ref.skillGrants.find((g) => g.skill === "iron-guard")?.grants.length, "Iron Guard's grants").toBe(2);
});

rule(
  { req: ["RD-4"], m: "M2" },
  "an unknown field or a wrong type is a format problem naming the file and entry",
  () => {
    const unknownField = edited("rarities.yaml", (list) => (list[1].limitt = 1));
    expect(problemsFor(unknownField).join("\n"), "problems with a misspelled field").toMatch(
      /rarities\.yaml legendary: .*limitt/,
    );
    const wrongType = edited("level-chart.yaml", (chart) => (chart.Warrior.levels[0].classBonus = "fifteen"));
    expect(problemsFor(wrongType).join("\n"), "problems with a word for a number").toMatch(
      /level-chart\.yaml.*classBonus/,
    );
  },
);

/** A folder holding `files`, removed once `use` is done with it. */
function inFolder<T>(files: ReferenceFiles, use: (dir: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), "awt-refdata-"));
  try {
    for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
    return use(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

rule(
  { req: ["RD-1", "RD-4"], m: "M2" },
  "the app's build reads and checks the reference data files: what it builds in is what loading them gives",
  () => {
    const built = inFolder(testFiles(), readReferenceData);
    // Built into the app as JSON, so it must come back the same from JSON.
    expect(JSON.parse(JSON.stringify(built)), "the reference data the build gives the app").toEqual(
      loadReferenceData(testFiles()),
    );
    expect(
      built.slotKinds.map((k) => k.id),
      "slot kinds the build read",
    ).toContain("tail");
  },
);

rule({ req: ["RD-4"], m: "M2" }, "the app's build fails on reference data with a problem, naming it", () => {
  const broken = edited("rarities.yaml", (list) => (list[1].limitt = 1));
  expect(() => inFolder(broken, readReferenceData), "building with a misspelled rarity field").toThrow(
    /RD-4[\s\S]*rarities\.yaml legendary: .*limitt/,
  );
});

rule({ req: ["RD-4", "RD-2"], m: "M2" }, "an entry without an ID is a problem", () => {
  const files = edited("slot-kinds.yaml", (list) => delete list[0].id);
  expect(problemsFor(files).join("\n"), "problems with a slot kind missing its ID").toMatch(/slot-kinds\.yaml.*id/);
});

rule({ req: ["RD-4"], m: "M2" }, "a reference to something that doesn't exist is a problem naming both", () => {
  const cases: [string, ReferenceFiles, RegExp][] = [
    [
      "a skill in an unknown tree",
      edited("skills.yaml", (d) => (d.skills[0].tree = "nowhere")),
      /blade-basics.*nowhere/,
    ],
    [
      "an unknown prerequisite",
      edited(
        "skills.yaml",
        (d) => (d.skills.find((s: any) => s.id === "cleave").prerequisites.all[1].skill = "made-up"),
      ),
      /cleave.*made-up/,
    ],
    [
      "an unknown replacement",
      edited("skills.yaml", (d) => (d.skills.find((s: any) => s.id === "glimmer").replacedBy = ["gone"])),
      /glimmer.*gone/,
    ],
    [
      "grants for an unknown skill",
      edited("skill-grants.yaml", (list) => (list[0].skill = "ghost-skill")),
      /ghost-skill/,
    ],
    [
      "a slot grant for an unknown slot kind",
      edited(
        "skill-grants.yaml",
        (list) => (list.find((g: any) => g.skill === "broad-shoulders").grants[0].slotKind = "wing"),
      ),
      /broad-shoulders.*wing/,
    ],
  ];
  for (const [what, files, pattern] of cases) {
    expect(problemsFor(files).join("\n"), `problems with ${what}`).toMatch(pattern);
  }
});

rule({ req: ["RD-4", "RD-2"], m: "M2" }, "duplicate IDs and duplicate names are problems", () => {
  const sameId = edited("rarities.yaml", (list) => list.push({ id: "epic", name: "Epic Again" }));
  expect(problemsFor(sameId).join("\n"), "problems with two rarities called epic").toMatch(
    /rarities\.yaml epic: .*duplicate/i,
  );
  const sameName = edited("skills.yaml", (d) =>
    d.skills.push({ id: "spark-2", name: "Spark", tree: "arcana", usage: "passive", tier: "normal" }),
  );
  expect(problemsFor(sameName).join("\n"), "problems with two skills named Spark").toMatch(
    /Spark.*duplicate|duplicate.*Spark/i,
  );
});

rule(
  { req: ["RD-4", "RD-3"], m: "M2" },
  "an entry released before that disappears is a problem: retire it instead",
  () => {
    const released = testFiles();
    const removed = edited("skills.yaml", (d) => (d.skills = d.skills.filter((s: any) => s.id !== "veil")));
    expect(problemsFor(removed, released).join("\n"), "problems after deleting Veil").toMatch(/veil.*retire/i);
    const retired = edited("skills.yaml", (d) => (d.skills.find((s: any) => s.id === "veil").retired = true));
    expect(problemsFor(retired, released), "problems after retiring Veil").toEqual([]);
  },
);

rule(
  { req: ["RD-4"], m: "M2" },
  "a level chart missing a level for a class is a problem naming the class and level",
  () => {
    const files = edited(
      "level-chart.yaml",
      (chart) => (chart.Rogue.levels = chart.Rogue.levels.filter((l: any) => l.level !== 17)),
    );
    expect(problemsFor(files).join("\n"), "problems with Rogue level 17 missing").toMatch(/Rogue.*17/);
  },
);

rule({ req: ["RD-5"], m: "M2" }, "the level cap is the chart's highest level, and adding rows raises it", () => {
  expect(levelCap(loadReferenceData(testFiles())), "the test chart's cap").toBe(30);
  const raised = edited("level-chart.yaml", (chart) => {
    for (const c of ["Warrior", "Mage", "Rogue"]) {
      chart[c].levels.push({ ...chart[c].levels[29], level: 31 });
    }
  });
  expect(problemsFor(raised), "problems with the cap raised to 31").toEqual([]);
  expect(levelCap(loadReferenceData(raised)), "the raised cap").toBe(31);
});

rule({ req: ["RD-5", "RD-4"], m: "M2" }, "a chart change can never lower the cap below what was released", () => {
  const released = testFiles();
  const lowered = edited("level-chart.yaml", (chart) => {
    for (const c of ["Warrior", "Mage", "Rogue"]) chart[c].levels = chart[c].levels.filter((l: any) => l.level <= 29);
  });
  expect(problemsFor(lowered, released).join("\n"), "problems with the cap lowered to 29").toMatch(/30/);
});

rule({ req: ["RD-7"], m: "M2" }, "a maintainer note on a skill or tree is valid data", () => {
  const files = edited("skills.yaml", (d) => (d.skills[0].maintainerNote = "Arrow unclear on the sheet (made up)."));
  expect(problemsFor(files), "problems with a maintainer note").toEqual([]);
});

rule(
  { req: ["RD-1", "RD-4"], m: "M2" },
  "combat dice can be several dice, and a class bonus can have dice; anything else is a problem naming the field",
  () => {
    const withDice = edited("level-chart.yaml", (chart) => {
      for (const row of chart.Rogue.levels.filter((l: any) => l.level >= 10)) {
        row.dice = "2d20 + 1d4";
        row.classBonusDice = "1d4";
      }
    });
    expect(problemsFor(withDice), "problems with Rogue dice like 2d20 + 1d4 and a 1d4 class bonus").toEqual([]);
    const row = loadReferenceData(withDice).levelChart.Rogue.levels.find((l) => l.level === 12);
    expect([row?.dice, row?.classBonusDice], "Rogue 12's combat dice and class bonus dice").toEqual([
      "2d20 + 1d4",
      "1d4",
    ]);
    const cases: [string, (row: any) => void, RegExp][] = [
      ["dice run together", (r) => (r.dice = "2d20+1d4"), /level-chart\.yaml.*dice/],
      ["dice ending in a plus", (r) => (r.dice = "2d20 + "), /level-chart\.yaml.*dice/],
      ["a class bonus die in words", (r) => (r.classBonusDice = "four"), /level-chart\.yaml.*classBonusDice/],
      ["class bonus dice with a number added", (r) => (r.classBonusDice = "1d4 + 3"), /classBonusDice/],
    ];
    for (const [what, change, pattern] of cases) {
      const files = edited("level-chart.yaml", (chart) => change(chart.Rogue.levels[0]));
      expect(problemsFor(files).join("\n"), `problems with ${what}`).toMatch(pattern);
    }
  },
);

rule({ req: ["RD-1", "SK-1a"], m: "M2" }, "a skill in several trees is read with its own place in each", () => {
  expect(problemsFor(testFiles()), "problems in the test reference data").toEqual([]);
  const step = loadReferenceData(testFiles()).skills.find((s) => s.id === "moonlit-step");
  expect(step?.trees, "Moonlit Step's trees").toEqual([
    { tree: "arcana", starting: true },
    { tree: "shadowcraft", prerequisites: { skill: "quick-fingers" } },
  ]);
});

rule(
  { req: ["RD-1", "RD-4"], m: "M2" },
  "a skill in several trees must name each tree once, trees and prerequisites that exist, and no tree of its own",
  () => {
    const step = (d: any) => d.skills.find((s: any) => s.id === "moonlit-step");
    const cases: [string, (d: any) => void, RegExp][] = [
      ["an unknown tree", (d) => (step(d).trees[1].tree = "nowhere"), /moonlit-step.*nowhere/],
      [
        "an unknown prerequisite in one tree",
        (d) => (step(d).trees[1].prerequisites = { skill: "made-up" }),
        /moonlit-step.*made-up/,
      ],
      ["the same tree twice", (d) => (step(d).trees[1].tree = "arcana"), /moonlit-step.*arcana/],
      ["a tree as well as trees", (d) => (step(d).tree = "arcana"), /moonlit-step/],
      ["a starting flag outside its trees", (d) => (step(d).starting = true), /moonlit-step/],
      ["no tree at all", (d) => delete step(d).trees, /moonlit-step/],
      ["an empty list of trees", (d) => (step(d).trees = []), /moonlit-step/],
    ];
    for (const [what, change, pattern] of cases) {
      expect(problemsFor(edited("skills.yaml", change)).join("\n"), `problems with ${what}`).toMatch(pattern);
    }
  },
);

rule(
  { req: ["RD-1", "GR-1", "RD-4"], m: "M4" },
  "a skill's grant can be in a group, and die-always names a group whose die always counts",
  () => {
    const grants = (skill: string) => loadReferenceData(testFiles()).skillGrants.find((g) => g.skill === skill)?.grants;
    expect(grants("cinder-mark-ii")?.[0], "Cinder Mark II's die").toMatchObject({ die: "1d8", group: "cinder-die" });
    expect(grants("cinder-focus"), "Cinder Focus's grants").toEqual([
      { id: "sg-cinder-focus-1", kind: "die-always", group: "cinder-die" },
    ]);
    const of = (list: any[], skill: string) => list.find((g: any) => g.skill === skill).grants;
    const cases: [string, (list: any[]) => void, RegExp][] = [
      [
        "a group on a permission",
        (list) => (of(list, "blade-basics")[0].group = "cinder-die"),
        /skill-grants\.yaml sg-blade-basics-1: .*group/,
      ],
      ["a group on an effect", (list) => (of(list, "night-eyes")[0].group = "cinder-die"), /night-eyes.*group/],
      ["die-always without a group", (list) => delete of(list, "cinder-focus")[0].group, /cinder-focus.*group/],
      [
        "die-always for a group no die is in",
        (list) => (of(list, "cinder-focus")[0].group = "cinder-dye"),
        /cinder-focus.*cinder-dye/,
      ],
      ["a group that isn't an ID", (list) => (of(list, "cinder-mark-i")[0].group = "Cinder Die"), /cinder-mark-i/],
    ];
    for (const [what, change, pattern] of cases) {
      expect(problemsFor(edited("skill-grants.yaml", change)).join("\n"), `problems with ${what}`).toMatch(pattern);
    }
  },
);

rule(
  { req: ["RD-1", "GR-13", "GR-1", "RD-4"], m: "M4" },
  "a skill's grant can be extra damage, with a type or none, in a group or not; a bad amount or another kind's field is a problem naming the grant",
  () => {
    const of = (list: any[], skill: string) => list.find((g: any) => g.skill === skill).grants;
    const withDamage = (damage: Record<string, unknown>) =>
      edited("skill-grants.yaml", (list) =>
        of(list, "iron-guard").push({ id: "sg-x-guard-dmg", kind: "extra-damage", ...damage }),
      );
    for (const damage of [
      { amount: 1, damageType: "cold" },
      { amount: 2 },
      { amount: 2, condition: "while raging", group: "rage" },
    ]) {
      const files = withDamage(damage);
      expect(problemsFor(files), `problems with extra damage ${JSON.stringify(damage)}`).toEqual([]);
      expect(
        loadReferenceData(files)
          .skillGrants.find((g) => g.skill === "iron-guard")
          ?.grants.at(-1),
        `Iron Guard's extra damage ${JSON.stringify(damage)}`,
      ).toEqual({ id: "sg-x-guard-dmg", kind: "extra-damage", ...damage });
    }
    for (const [what, damage] of [
      ["an amount of 0", { amount: 0 }],
      ["a fractional amount", { amount: 1.5 }],
      ["no amount", { damageType: "cold" }],
      ["a type that isn't text", { amount: 1, damageType: 3 }],
      ["a group that isn't an ID", { amount: 1, group: "Rage Group" }],
      ["a die", { amount: 1, die: "1d6" }],
    ] as const) {
      expect(problemsFor(withDamage(damage)).join("\n"), `problems with extra damage with ${what}`).toMatch(
        /^skill-grants\.yaml sg-x-guard-dmg: /m,
      );
    }
  },
);

rule(
  { req: ["RD-1", "GR-13", "RD-4"], m: "M4" },
  "a skill's extra damage type is trimmed, and a blank one is a problem naming the grant",
  () => {
    const of = (list: any[], skill: string) => list.find((g: any) => g.skill === skill).grants;
    const withType = (damageType: string) =>
      edited("skill-grants.yaml", (list) =>
        of(list, "iron-guard").push({ id: "sg-x-guard-dmg", kind: "extra-damage", amount: 1, damageType }),
      );
    const padded = withType(" cold ");
    expect(problemsFor(padded), "problems with a padded type").toEqual([]);
    expect(
      loadReferenceData(padded)
        .skillGrants.find((g) => g.skill === "iron-guard")
        ?.grants.at(-1),
      "Iron Guard's extra damage, its type trimmed",
    ).toEqual({ id: "sg-x-guard-dmg", kind: "extra-damage", amount: 1, damageType: "cold" });
    expect(problemsFor(withType("  ")).join("\n"), "problems with a blank type").toMatch(
      /^skill-grants\.yaml sg-x-guard-dmg: /m,
    );
  },
);

rule(
  { req: ["RD-1", "GR-1", "GR-13", "RD-4"], m: "M4" },
  "a skill's extra damage can give its amount as text instead, trimmed; text with an amount or a group, or blank, is a problem naming the grant",
  () => {
    const of = (list: any[], skill: string) => list.find((g: any) => g.skill === skill).grants;
    const withDamage = (damage: Record<string, unknown>) =>
      edited("skill-grants.yaml", (list) =>
        of(list, "iron-guard").push({ id: "sg-x-guard-dmg", kind: "extra-damage", ...damage }),
      );
    for (const [damage, kept] of [
      [
        { amountText: "1d4 hearts of a chosen element", condition: "1/combat" },
        { amountText: "1d4 hearts of a chosen element", condition: "1/combat" },
      ],
      [{ amountText: " 1 heart per frost mark " }, { amountText: "1 heart per frost mark" }],
      [
        { amountText: "1 heart per frost mark", damageType: "cold" },
        { amountText: "1 heart per frost mark", damageType: "cold" },
      ],
    ] as const) {
      const files = withDamage(damage);
      expect(problemsFor(files), `problems with extra damage ${JSON.stringify(damage)}`).toEqual([]);
      expect(
        loadReferenceData(files)
          .skillGrants.find((g) => g.skill === "iron-guard")
          ?.grants.at(-1),
        `Iron Guard's extra damage ${JSON.stringify(damage)}`,
      ).toEqual({ id: "sg-x-guard-dmg", kind: "extra-damage", ...kept });
    }
    for (const [what, damage] of [
      ["text and an amount", { amountText: "1d4 hearts", amount: 1 }],
      ["text in a group", { amountText: "1d4 hearts", group: "rage" }],
      ["blank text", { amountText: "  " }],
      ["text that isn't text", { amountText: 4 }],
    ] as const) {
      expect(problemsFor(withDamage(damage)).join("\n"), `problems with extra damage with ${what}`).toMatch(
        /^skill-grants\.yaml sg-x-guard-dmg: /m,
      );
    }
  },
);

rule(
  { req: ["RD-1", "GR-1", "RD-4"], m: "M4" },
  "each problem with class bonus dice, groups or die-always names its file and the exact entry",
  () => {
    const skillGrants = (change: (list: any[]) => void) => problemsFor(edited("skill-grants.yaml", change)).join("\n");
    const of = (list: any[], skill: string) => list.find((g: any) => g.skill === skill).grants;
    expect(
      skillGrants((list) => (of(list, "cinder-focus")[0].condition = "1/combat")),
      "problems with die-always given a condition",
    ).toMatch(/^skill-grants\.yaml sg-cinder-focus-1: .*condition/m);
    expect(
      skillGrants((list) => (of(list, "cinder-mark-i")[0].group = "Cinder Die")),
      "problems with a group that isn't an ID",
    ).toMatch(/^skill-grants\.yaml sg-cinder-mark-i-1: .*group/m);
    expect(
      skillGrants((list) => (of(list, "night-eyes")[0].group = "cinder-die")),
      "problems with a group on an effect",
    ).toMatch(/^skill-grants\.yaml sg-night-eyes-1: .*group/m);
    const chart = edited("level-chart.yaml", (c) => (c.Rogue.levels[0].classBonusDice = "1d4 + 3"));
    expect(problemsFor(chart).join("\n"), "problems with class bonus dice with a number added").toMatch(
      /^level-chart\.yaml: Rogue\.levels\.0\.classBonusDice/m,
    );
  },
);

rule(
  { req: ["RD-6", "RD-4"], m: "M2" },
  "the app's own reference data in data/ is complete and has no problems",
  () => {
    for (const file of [
      "level-chart.yaml",
      "slot-kinds.yaml",
      "rarities.yaml",
      "suggestions.yaml",
      "skills.yaml",
      "skill-grants.yaml",
    ]) {
      expect(existsSync(new URL(file, DATA)), `data/${file}`).toBe(true);
    }
    expect(problemsFor(readFiles(DATA)), "problems in data/").toEqual([]);
  },
);

rule(
  { req: ["RD-8", "SK-2"], m: "M2" },
  "data/'s skill list has card text, and none of the tests' made-up card text comes from it",
  () => {
    const textsOf = (dir: URL) =>
      (parse(readFileSync(new URL("skills.yaml", dir), "utf8")) as { skills: { id: string; text?: string }[] }).skills
        .filter((s) => s.text !== undefined)
        .map((s) => s.text!);
    const real = new Set(textsOf(DATA));
    expect(real.size, "skills in data/ with card text").toBeGreaterThan(0);
    expect(
      textsOf(FIXTURES).filter((t) => real.has(t)),
      "the tests' card text found in data/",
    ).toEqual([]);
  },
);

rule({ req: ["RD-8"], m: "M2" }, "data/'s level chart has its numbers, and the tests' made-up chart isn't it", () => {
  const chart = loadReferenceData(readFiles(DATA)).levelChart;
  expect(Object.keys(chart).sort(), "the classes in data/level-chart.yaml").toEqual(["Mage", "Rogue", "Warrior"]);
  const madeUp = loadReferenceData(testFiles()).levelChart;
  for (const [className, { levels }] of Object.entries(chart)) {
    expect(levels.length, `${className}'s levels in data/`).toBeGreaterThan(0);
    const placeholder = levels.filter((l) => l.classBonus === 0 && l.hearts === 0 && l.dice === "1d1");
    expect(
      placeholder.map((l) => l.level),
      `${className}'s levels in data/ with no numbers`,
    ).toEqual([]);
    expect(levels, `${className}'s chart in data/ against the tests' own`).not.toEqual(
      madeUp[className as keyof typeof madeUp].levels,
    );
  }
});
