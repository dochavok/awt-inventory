// Grants and totals (section 8: GR-1 to GR-12), in the rules core.
// The scenarios in tests/scenarios/totals.yaml, plus checks a scenario can't
// express: each grant line's category and source details (GR-12), and that the
// level chart is read rather than built in (TF-3).

import { expect } from "vitest";
import { computeTotals } from "../../src/rules";
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
