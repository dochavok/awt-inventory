// Property tests for damage (TF-10, GR-13): generated characters whose entries,
// titles and manual grants carry extra damage, of a type or none, some of it
// situational. The generator is this file's own: it adds extra damage to the
// characters from tests/support/arbitraries.ts.

import fc from "fast-check";
import { expect } from "vitest";
import { computeTotals, type CharacterSheet, type Grant, type Totals } from "../../src/rules";
import { sheetArb, sourcesOf, withoutSource } from "../support/arbitraries";
import { testReferenceData } from "../support/fixtures";
import { rule } from "../support/rule";

const ref = testReferenceData();
const RUNS = { numRuns: 1000 };

/** Extra damage of 1 to 20 hearts, with a type or none; `situational: true` always gives it a condition. */
function damageArb(id: string, situational?: true): fc.Arbitrary<Grant> {
  const condition = situational
    ? fc.constant("vs Undead")
    : fc.oneof({ weight: 3, arbitrary: fc.constant(undefined) }, { weight: 1, arbitrary: fc.constant("vs Evil") });
  return fc.tuple(fc.integer({ min: 1, max: 20 }), fc.constantFrom(undefined, "fire", "Fire", "cold"), condition).map(
    ([amount, damageType, c]) =>
      ({
        id,
        kind: "extra-damage",
        amount,
        ...(damageType ? { damageType } : {}),
        ...(c ? { condition: c } : {}),
      }) as Grant,
  );
}

/** A generated character with up to 8 extra damage grants spread over its entries, titles and manual grants. */
const damageSheetArb: fc.Arbitrary<CharacterSheet> = sheetArb(ref).chain((sheet) =>
  fc
    .array(fc.nat(), { maxLength: 8 })
    .chain((picks) =>
      fc.tuple(...picks.map((_, i) => damageArb(`dmg-${i}`))).map((damages) => ({ picks, damages: [...damages] })),
    )
    .map(({ picks, damages }) => {
      const out: CharacterSheet = structuredClone(sheet);
      const holders: { grants?: Grant[] }[] = [
        ...out.entries.filter((e) => e.category !== "skills" && e.category !== "consumables"),
        ...out.titles,
        ...out.manualGrants,
      ] as { grants?: Grant[] }[];
      damages.forEach((damage, i) => {
        const pick = picks[i]!;
        if (holders.length === 0) {
          out.manualGrants.push({ id: `m-dmg-${i}`, reason: `Damage ruling ${i}`, grants: [damage] });
          return;
        }
        const holder = holders[pick % holders.length]!;
        holder.grants = [...(holder.grants ?? []), damage];
      });
      return out;
    }),
);

const sorted = (list: unknown[]) => list.map((x) => JSON.stringify(x)).sort();

rule(
  { req: ["TF-10", "GR-13", "GR-4"], m: "M4" },
  "damage is always the base of 1 heart plus every extra damage it lists, none of them situational",
  () => {
    fc.assert(
      fc.property(damageSheetArb, (sheet) => {
        const { damage } = computeTotals(sheet, ref);
        expect(damage.base, "the base damage").toBe(1);
        expect(damage.value, "damage vs its lines").toBe(1 + damage.grants.reduce((s, d) => s + d.amount, 0));
        expect(
          damage.grants.every((d) => !d.condition),
          "no situational extra damage is counted",
        ).toBe(true);
        expect(
          damage.situational.every((d) => d.condition),
          "every situational line has its condition",
        ).toBe(true);
      }),
      RUNS,
    );
  },
);

rule({ req: ["TF-10", "GR-13", "GR-4"], m: "M4" }, "adding a situational extra damage never changes the damage", () => {
  fc.assert(
    fc.property(damageSheetArb, damageArb("added", true), (sheet, grant) => {
      const before = computeTotals(sheet, ref);
      const withGrant: CharacterSheet = {
        ...sheet,
        manualGrants: [...sheet.manualGrants, { id: "m-added", reason: "Situational", grants: [grant] }],
      };
      const after = computeTotals(withGrant, ref);
      expect(after.damage.value, "damage").toBe(before.damage.value);
      expect(after.damage.grants, "the damage's lines").toEqual(before.damage.grants);
      expect(after.damage.situational.length, "situational damage lines").toBe(before.damage.situational.length + 1);
    }),
    RUNS,
  );
});

rule({ req: ["TF-10", "GR-13", "GR-5"], m: "M4" }, "removing or unequipping a source never raises the damage", () => {
  fc.assert(
    fc.property(
      damageSheetArb.chain((sheet) =>
        fc.tuple(fc.constant(sheet), fc.constantFrom(...sourcesOf(sheet), { type: "unequip" as const, id: "" })),
      ),
      ([sheet, source]) => {
        const after =
          source.type === "unequip" ? { ...sheet, equipped: sheet.equipped.slice(1) } : withoutSource(sheet, source);
        expect(
          computeTotals(after, ref).damage.value,
          `damage after removing ${source.type} ${source.id}`,
        ).toBeLessThanOrEqual(computeTotals(sheet, ref).damage.value);
      },
    ),
    RUNS,
  );
});

rule(
  { req: ["TF-10", "GR-13"], m: "M4" },
  "the order entries, titles and manual grants were added in doesn't change the damage or what it lists",
  () => {
    const listed = (t: Totals) => [t.damage.value, sorted(t.damage.grants), sorted(t.damage.situational)];
    fc.assert(
      fc.property(
        damageSheetArb.chain((sheet) =>
          fc.tuple(
            fc.constant(sheet),
            fc.shuffledSubarray(sheet.entries, { minLength: sheet.entries.length }),
            fc.shuffledSubarray(sheet.titles, { minLength: sheet.titles.length }),
            fc.shuffledSubarray(sheet.manualGrants, { minLength: sheet.manualGrants.length }),
          ),
        ),
        ([sheet, entries, titles, manualGrants]) => {
          const shuffled = { ...sheet, entries, titles, manualGrants };
          expect(listed(computeTotals(shuffled, ref)), "damage and its lines").toEqual(
            listed(computeTotals(sheet, ref)),
          );
        },
      ),
      RUNS,
    );
  },
);
