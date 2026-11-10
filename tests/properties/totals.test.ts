// Property tests for totals (TF-10): thousands of generated characters check
// rules that must always hold. Generators: tests/support/arbitraries.ts.

import fc from "fast-check";
import { expect } from "vitest";
import { computeTotals, slotState, type CharacterSheet, type Grant, type Total, type Totals } from "../../src/rules";
import { grantArb, sheetArb, sourcesOf, withoutSource } from "../support/arbitraries";
import { testReferenceData } from "../support/fixtures";
import { rule } from "../support/rule";

const ref = testReferenceData();
const RUNS = { numRuns: 1000 };

const totalsOf = (t: Totals): [string, Total][] => [
  ["CM", t.cm],
  ["mitigation", t.mitigation],
  ["max hearts", t.hearts],
];

rule(
  { req: ["TF-10", "GR-8", "GR-9", "GR-10", "GR-12"], m: "M4" },
  "every total equals the sum of its breakdown lines and of its grants",
  () => {
    fc.assert(
      fc.property(sheetArb(ref), (sheet) => {
        for (const [name, total] of totalsOf(computeTotals(sheet, ref))) {
          expect(total.value, `${name} vs its lines`).toBe(total.lines.reduce((s, l) => s + l.value, 0));
          expect(total.value, `${name} vs its grants`).toBe(total.grants.reduce((s, g) => s + g.amount, 0));
          expect(
            total.lines.every((l) => l.value !== 0),
            `${name} hides zero lines`,
          ).toBe(true);
        }
      }),
      RUNS,
    );
  },
);

rule({ req: ["TF-10", "GR-4"], m: "M4" }, "adding a situational grant never changes a total", () => {
  fc.assert(
    fc.property(sheetArb(ref), grantArb(ref, "added", true), (sheet, grant) => {
      const before = computeTotals(sheet, ref);
      const withGrant: CharacterSheet = {
        ...sheet,
        manualGrants: [...sheet.manualGrants, { id: "m-added", reason: "Situational", grants: [grant as Grant] }],
      };
      const after = computeTotals(withGrant, ref);
      expect(after.cm.value, "CM").toBe(before.cm.value);
      expect(after.mitigation.value, "mitigation").toBe(before.mitigation.value);
      expect(after.hearts.value, "max hearts").toBe(before.hearts.value);
      expect(after.dice.extra, "extra dice").toEqual(before.dice.extra);
    }),
    RUNS,
  );
});

rule(
  { req: ["TF-10", "GR-5", "EQ-8"], m: "M4" },
  "removing or unequipping a source never raises a total or a slot allowance",
  () => {
    fc.assert(
      fc.property(
        sheetArb(ref).chain((sheet) =>
          fc.tuple(fc.constant(sheet), fc.constantFrom(...sourcesOf(sheet), { type: "unequip" as const, id: "" })),
        ),
        ([sheet, source]) => {
          const after =
            source.type === "unequip" ? { ...sheet, equipped: sheet.equipped.slice(1) } : withoutSource(sheet, source);
          const [t0, t1] = [computeTotals(sheet, ref), computeTotals(after, ref)];
          for (const [i, [name, total]] of totalsOf(t1).entries()) {
            expect(total.value, `${name} after removing ${source.type} ${source.id}`).toBeLessThanOrEqual(
              totalsOf(t0)[i]![1].value,
            );
          }
          const [s0, s1] = [slotState(sheet, ref), slotState(after, ref)];
          for (const kind of s1.kinds) {
            const was = s0.kinds.find((k) => k.kind === kind.kind)!;
            expect(kind.allowed, `${kind.kind} slots allowed`).toBeLessThanOrEqual(was.allowed);
          }
          expect(s1.arcane.allowed, "arcane slots allowed").toBeLessThanOrEqual(s0.arcane.allowed);
        },
      ),
      RUNS,
    );
  },
);

rule(
  { req: ["TF-10"], m: "M4" },
  "the order entries, titles and grants were added in doesn't change any total or slot count",
  () => {
    fc.assert(
      fc.property(
        sheetArb(ref).chain((sheet) =>
          fc.tuple(
            fc.constant(sheet),
            fc.shuffledSubarray(sheet.entries, { minLength: sheet.entries.length }),
            fc.shuffledSubarray(sheet.titles, { minLength: sheet.titles.length }),
            fc.shuffledSubarray(sheet.manualGrants, { minLength: sheet.manualGrants.length }),
          ),
        ),
        ([sheet, entries, titles, manualGrants]) => {
          const shuffled = { ...sheet, entries, titles, manualGrants };
          const [a, b] = [computeTotals(sheet, ref), computeTotals(shuffled, ref)];
          for (const [i, [name, total]] of totalsOf(a).entries()) {
            expect(totalsOf(b)[i]![1].value, name).toBe(total.value);
            expect(totalsOf(b)[i]![1].lines, `${name} lines`).toEqual(total.lines);
          }
          const [s, t] = [slotState(sheet, ref), slotState(shuffled, ref)];
          expect(
            t.kinds.map((k) => [k.kind, k.allowed, k.equipped]),
            "slot counts",
          ).toEqual(s.kinds.map((k) => [k.kind, k.allowed, k.equipped]));
          expect([t.arcane.allowed, t.arcane.used], "arcane slots").toEqual([s.arcane.allowed, s.arcane.used]);
        },
      ),
      RUNS,
    );
  },
);
