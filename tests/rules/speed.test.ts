// Speed of the rules core (NF-4): after a change, totals and slot counts
// update in under 0.2 seconds, even for the largest character NF-6 allows.

import { expect } from "vitest";
import { computeTotals, overLimitAlerts, slotState, type CharacterSheet, type Entry } from "../../src/rules";
import { fixtureSheet, testReferenceData } from "../support/fixtures";
import { rule } from "../support/rule";

function bigCharacter(): CharacterSheet {
  const sheet = fixtureSheet("aldric");
  const extra: Entry[] = Array.from({ length: 1000 - sheet.entries.length }, (_, i) => ({
    id: `big-${i}`,
    characterId: "aldric",
    category: "items",
    name: `Trinket ${i}`,
    quantity: 1,
    arcane: false,
    grants: [{ id: `big-g-${i}`, kind: "cm", amount: 1 }],
  }));
  return { ...sheet, entries: [...sheet.entries, ...extra] };
}

rule(
  { req: ["NF-4"], m: "M4" },
  "totals, slot counts and alerts for a 1,000-entry character take under 0.2 seconds",
  () => {
    const sheet = bigCharacter();
    const ref = testReferenceData();
    computeTotals(sheet, ref); // warm up
    const start = performance.now();
    const totals = computeTotals(sheet, ref);
    slotState(sheet, ref);
    overLimitAlerts(sheet, ref);
    const elapsed = performance.now() - start;
    expect(totals.cm.value, "the big character's CM (unequipped trinkets don't count)").toBe(170);
    expect(elapsed, "milliseconds to work out everything").toBeLessThan(200);
  },
);
