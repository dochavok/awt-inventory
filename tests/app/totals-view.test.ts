// How the character's page words its damage (GR-13): the heading, the base,
// then a line for each extra damage that counts with where it comes from, as
// slots name sources ("Skill: ", "Title: ", "Manual grant: "), and the
// situational ones apart with their condition.

import { expect } from "vitest";
import { totalsView } from "../../src/app/grant-text";
import { computeTotals } from "../../src/rules";
import { fixtureSheet, testReferenceData } from "../support/fixtures";
import { rule } from "../support/rule";

rule(
  { req: ["GR-13", "GR-4"], m: "M4" },
  "the character's page names each damage line's source as GR-13's example does, situational ones apart",
  () => {
    const ref = testReferenceData();
    ref.skillGrants
      .find((g) => g.skill === "iron-guard")!
      .grants.push({ id: "sg-x-guard-dmg", kind: "extra-damage", amount: 1, damageType: "cold" });
    const sheet = fixtureSheet("aldric");
    sheet.titles[0]!.grants = [{ id: "g-x-title-dmg", kind: "extra-damage", amount: 1, damageType: "fire" }];
    sheet.manualGrants.push({
      id: "m-x-dmg",
      reason: "Shrine blessing",
      grants: [
        { id: "g-x-manual-dmg", kind: "extra-damage", amount: 3, damageType: "radiant", condition: "vs Undead" },
      ],
    });
    const { damage } = totalsView(computeTotals(sheet, ref));
    expect(damage.heading, "Aldric's damage heading").toBe("Damage 5 hearts");
    expect(damage.lines, "Aldric's damage lines").toEqual([
      "base 1",
      "+2 hearts (Duskfang)",
      "+1 heart cold (Skill: Iron Guard)",
      "+1 heart fire (Title: Friend of the Forest)",
    ]);
    expect(damage.situational, "Aldric's situational damage lines").toEqual([
      "+3 hearts radiant (Manual grant: Shrine blessing, vs Undead)",
    ]);
  },
);

rule(
  { req: ["GR-13", "GR-1", "GR-4"], m: "M4" },
  "the character's page lists a skill's extra damage given as text with the situational ones, after a +, as GR-13's example does",
  () => {
    const ref = testReferenceData();
    const grantsOf = (skill: string) => ref.skillGrants.find((g) => g.skill === skill)!.grants;
    grantsOf("iron-guard").push({
      id: "sg-x-text-1",
      kind: "extra-damage",
      amountText: "1d4 hearts of a chosen element",
      condition: "1/combat",
    });
    grantsOf("blade-basics").push({ id: "sg-x-text-2", kind: "extra-damage", amountText: "1 heart per frost mark" });
    const sheet = fixtureSheet("aldric");
    sheet.manualGrants.push({
      id: "m-x-dmg",
      reason: "Shrine blessing",
      grants: [
        { id: "g-x-manual-dmg", kind: "extra-damage", amount: 3, damageType: "radiant", condition: "vs Undead" },
      ],
    });
    const { damage } = totalsView(computeTotals(sheet, ref));
    expect(damage.heading, "Aldric's damage heading, the text ones not added in").toBe("Damage 3 hearts");
    expect(damage.lines, "Aldric's damage lines").toEqual(["base 1", "+2 hearts (Duskfang)"]);
    expect(damage.situational, "Aldric's situational damage lines, whole hearts first").toEqual([
      "+3 hearts radiant (Manual grant: Shrine blessing, vs Undead)",
      "+1 heart per frost mark (Skill: Blade Basics)",
      "+1d4 hearts of a chosen element (Skill: Iron Guard, 1/combat)",
    ]);
  },
);

rule({ req: ["GR-13"], m: "M4" }, "with no extra damage, the character's page shows 1 heart and the base alone", () => {
  const sheet = fixtureSheet("aldric");
  sheet.equipped = sheet.equipped.filter((q) => q.entryId !== "aldric-sword");
  const { damage } = totalsView(computeTotals(sheet, testReferenceData()));
  expect(damage, "Aldric's damage, Duskfang unequipped").toEqual({
    heading: "Damage 1 heart",
    lines: ["base 1"],
    situational: [],
  });
});
