/* eslint-disable @typescript-eslint/no-explicit-any -- these tests edit raw YAML of any shape to make broken copies */
// Reference data (section 13: RD-1 to RD-8): reading the files and the CI
// checks on them. Uses the test copy in tests/fixtures/refdata/, and broken
// copies made from it inside each test; never the real files, except the
// RD-6 and RD-8 checks on data/ itself.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect } from "vitest";
import { parse, stringify } from "yaml";
import { levelCap, loadReferenceData, validateReferenceData, type ReferenceFiles } from "../../src/refdata";
import { rule } from "../support/rule";

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
  { req: ["RD-8"], q: ["Q10"], m: "M2" },
  "until the owner agrees, data/ holds no skill card text (and the skill list exists without it)",
  () => {
    expect(existsSync(new URL("skills.yaml", DATA)), "data/skills.yaml").toBe(true);
    const skills = parse(readFileSync(new URL("skills.yaml", DATA), "utf8")) as {
      skills: { id: string; text?: string }[];
    };
    const withText = skills.skills.filter((s) => s.text !== undefined).map((s) => s.id);
    expect(withText, "skills in data/ with card text").toEqual([]);
  },
);
