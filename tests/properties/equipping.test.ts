// Property tests for equipping (TF-10): normal equipping never goes over a
// limit, and only a lost grant can, which always raises an alert (EQ-8).

import fc from "fast-check";
import { expect } from "vitest";
import { checkEquip, overLimitAlerts, slotState, type CharacterSheet, type ReferenceData } from "../../src/rules";
import { possibleTargets, sheetArb, sourcesOf, withoutSource } from "../support/arbitraries";
import { testReferenceData } from "../support/fixtures";
import { rule } from "../support/rule";

const ref = testReferenceData();
const RUNS = { numRuns: 500 };

/** Tries each (entry, target) in turn, equipping only what checkEquip allows. */
function equipInTurn(sheet: CharacterSheet, attempts: [number, number][], data: ReferenceData): CharacterSheet {
  let current = sheet;
  for (const [e, t] of attempts) {
    const entry = current.entries[e % Math.max(current.entries.length, 1)];
    if (!entry) break;
    const targets = possibleTargets(entry);
    const target = targets[t % Math.max(targets.length, 1)];
    if (!target) continue;
    if (checkEquip(current, data, entry.id, target).outcome === "allowed") {
      current = { ...current, equipped: [...current.equipped, { entryId: entry.id, slot: target }] };
    }
  }
  return current;
}

const attemptsArb = fc.array(fc.tuple(fc.nat(), fc.nat()), { maxLength: 30 });

function overLimit(sheet: CharacterSheet, data: ReferenceData, withRarity: boolean): string[] {
  const state = slotState(sheet, data);
  return [
    ...state.kinds.filter((k) => k.equipped > k.allowed).map((k) => k.kind),
    ...(state.arcane.used > state.arcane.allowed ? ["arcane"] : []),
    ...(withRarity
      ? state.rarities.filter((r) => r.allowed !== null && r.equipped > r.allowed).map((r) => `rarity:${r.rarity}`)
      : []),
  ].sort();
}

function alertScopes(sheet: CharacterSheet, data: ReferenceData, withRarity: boolean): string[] {
  return overLimitAlerts(sheet, data)
    .map((a) =>
      a.scope.type === "slot-kind" ? a.scope.id : a.scope.type === "arcane" ? "arcane" : `rarity:${a.scope.id}`,
    )
    .filter((s) => withRarity || !s.startsWith("rarity:"))
    .sort();
}

rule(
  { req: ["TF-10", "EQ-2", "EQ-3", "EQ-7"], m: "M4" },
  "equipping only what's allowed never exceeds a slot kind or the arcane slots",
  () => {
    fc.assert(
      fc.property(sheetArb(ref, { unequipped: true }), attemptsArb, (sheet, attempts) => {
        const result = equipInTurn(sheet, attempts, ref);
        expect(overLimit(result, ref, false), "slot kinds over their limit").toEqual([]);
        expect(alertScopes(result, ref, false), "over-limit alerts").toEqual([]);
      }),
      RUNS,
    );
  },
);

rule({ req: ["TF-10", "EQ-10"], m: "M5" }, "equipping only what's allowed never exceeds a rarity allowance", () => {
  fc.assert(
    fc.property(sheetArb(ref, { unequipped: true }), attemptsArb, (sheet, attempts) => {
      const result = equipInTurn(sheet, attempts, ref);
      expect(overLimit(result, ref, true), "slot kinds and rarities over their limit").toEqual([]);
    }),
    RUNS,
  );
});

rule(
  { req: ["TF-10", "EQ-8"], m: "M4" },
  "after a source is removed, every slot kind over its limit has an alert, and no other does",
  () => {
    fc.assert(
      fc.property(sheetArb(ref, { unequipped: true }), attemptsArb, fc.nat(), (sheet, attempts, pick) => {
        const equipped = equipInTurn(sheet, attempts, ref);
        const sources = sourcesOf(equipped);
        if (sources.length === 0) return;
        const after = withoutSource(equipped, sources[pick % sources.length]!);
        expect(alertScopes(after, ref, false), "alerts after removing a source").toEqual(overLimit(after, ref, false));
      }),
      RUNS,
    );
  },
);
