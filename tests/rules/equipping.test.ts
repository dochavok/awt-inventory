// Equipping (section 9: EQ-1 to EQ-11), in the rules core. The scenarios in
// tests/scenarios/equipping.yaml, plus checks of the whole paper doll (EQ-5)
// and that slot kinds and rarities come from the reference data (TF-3).

import { expect } from "vitest";
import { checkEquip, slotState } from "../../src/rules";
import { fixtureSheet, testReferenceData } from "../support/fixtures";
import { rule } from "../support/rule";
import { runScenarios } from "../support/scenarios";

runScenarios("equipping.yaml");

rule(
  { req: ["EQ-5", "EQ-1"], m: "M4" },
  "Aldric's paper doll shows every slot kind once, with what's in it or empty",
  () => {
    const state = slotState(fixtureSheet("aldric"), testReferenceData());
    expect(
      state.kinds.map((k) => [k.kind, k.slots.map((s) => [s.label, s.occupant?.name ?? "Empty"])]),
      "Aldric's slots, in reference data order",
    ).toEqual([
      ["head", [["Head", "Hawkeye Helm"]]],
      ["chest", [["Chest", "Ironclad Plate"]]],
      ["shoulder", [["Shoulder", "Empty"]]],
      ["neck", [["Neck", "Empty"]]],
      ["back", [["Back", "Empty"]]],
      ["glove-arm", [["Glove/Arm", "Ember Gauntlets"]]],
      ["ring-right", [["Right Hand (Ring)", "Empty"]]],
      ["ring-left", [["Left Hand (Ring)", "Empty"]]],
      ["pants", [["Pants", "Empty"]]],
      ["belt", [["Belt", "Empty"]]],
      ["boot", [["Boot", "Stridewalk Boots"]]],
      ["relic", [["Relic", "Empty"]]],
      ["tail", [["Tail", "Empty"]]],
      ["main-hand", [["Main hand", "Duskfang"]]],
      ["off-hand", [["Off hand", "Empty"]]],
    ]);
  },
);

rule({ req: ["EQ-1", "TF-3"], m: "M4" }, "a slot kind added to the reference data appears on every character", () => {
  const ref = testReferenceData();
  ref.slotKinds.push({ id: "wings", name: "Wings" });
  const wings = slotState(fixtureSheet("brin"), ref).kinds.find((k) => k.kind === "wings");
  expect(wings, "Brin's Wings slot").toMatchObject({ name: "Wings", allowed: 1, equipped: 0 });
});

rule({ req: ["EQ-1", "RD-3"], m: "M4" }, "a retired slot kind still shows when something is already in it", () => {
  const sheet = fixtureSheet("aldric");
  sheet.entries.push({
    id: "x-cape",
    characterId: "aldric",
    category: "armor",
    name: "Old Cape",
    quantity: 1,
    slotKind: "cape",
  });
  sheet.equipped.push({ entryId: "x-cape", slot: "cape" });
  const cape = slotState(sheet, testReferenceData()).kinds.find((k) => k.kind === "cape");
  expect(
    cape?.slots.map((s) => s.occupant?.name),
    "what's in Aldric's retired Cape slot",
  ).toEqual(["Old Cape"]);
});

rule(
  { req: ["EQ-10", "TF-3"], m: "M5" },
  "a rarity's limit comes from the reference data: raising Legendary to 2 allows a second",
  () => {
    const ref = testReferenceData();
    ref.rarities.find((r) => r.id === "legendary")!.limit = 2;
    const sheet = fixtureSheet("aldric");
    sheet.entries.push({
      id: "x-crown",
      characterId: "aldric",
      category: "armor",
      name: "Sun Crown",
      quantity: 1,
      slotKind: "neck",
      rarity: "legendary",
    });
    expect(checkEquip(sheet, ref, "x-crown", "neck").outcome, "equipping a second Legendary with a limit of 2").toBe(
      "allowed",
    );
  },
);

rule({ req: ["EQ-1", "RD-3"], m: "M4" }, "a retired hand slot kind blocks a weapon there instead of failing", () => {
  const ref = testReferenceData();
  ref.slotKinds.find((k) => k.id === "off-hand")!.retired = true;
  const sheet = fixtureSheet("aldric");
  sheet.entries.push({
    id: "x-dagger",
    characterId: "aldric",
    category: "weapons",
    name: "Iron Dagger",
    quantity: 1,
    hands: 1,
    range: "melee",
  });
  const result = checkEquip(sheet, ref, "x-dagger", "off-hand");
  expect(
    [result.outcome, result.block?.reason, result.block?.about],
    "equipping a dagger in a retired Off hand",
  ).toEqual(["blocked", "wrong-slot", "off-hand"]);
  expect(result.block?.message, "the block names the dagger").toContain("Iron Dagger");
  expect(result.block?.message, "the block names the Off hand").toContain("Off hand");
});

rule(
  { req: ["EQ-1", "GR-1"], m: "M4" },
  "a slot grant below 1 in bad data adds no slot and doesn't break Aldric's paper doll",
  () => {
    const sheet = fixtureSheet("aldric");
    sheet.manualGrants.push({
      id: "m-bad",
      reason: "Bad data",
      grants: [{ id: "g-bad", kind: "slots", slotKind: "back", amount: -1 }],
    });
    const back = slotState(sheet, testReferenceData()).kinds.find((k) => k.kind === "back");
    expect([back?.allowed, back?.slots.length], "Aldric's Back slots allowed and shown").toEqual([1, 1]);
  },
);

rule(
  { req: ["EQ-6", "GR-1"], m: "M4" },
  "arcane slot grants that aren't a whole number of 1 or more add nothing and aren't listed",
  () => {
    const sheet = fixtureSheet("isolde");
    sheet.manualGrants.push({
      id: "m-bad",
      reason: "Bad data",
      grants: [
        { id: "g-nan", kind: "arcane-slots", amount: Number.NaN },
        { id: "g-inf", kind: "arcane-slots", amount: Number.POSITIVE_INFINITY },
        { id: "g-neg", kind: "arcane-slots", amount: -2 },
        { id: "g-half", kind: "arcane-slots", amount: 1.5 },
      ],
    });
    const { arcane } = slotState(sheet, testReferenceData());
    expect([arcane.allowed, arcane.grants.length], "Isolde's arcane slots and their grant lines").toEqual([5, 0]);
  },
);

rule({ req: ["EQ-7"], m: "M4" }, "the arcane slot count reads as used of allowed, e.g. 1 of 5 for Isolde", () => {
  const { arcane } = slotState(fixtureSheet("isolde"), testReferenceData());
  expect([arcane.used, arcane.allowed], "Isolde's arcane slots used and allowed").toEqual([1, 5]);
  expect([arcane.starting, arcane.fromLevels], "Isolde's arcane slots from her class start and her levels").toEqual([
    3, 2,
  ]);
});
