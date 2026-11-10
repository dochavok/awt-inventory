// fast-check generators for property tests (TF-10): random characters built
// from the test reference data. Amounts are positive, as every grant in GR-1 is.

import fc from "fast-check";
import type {
  CharacterSheet,
  ClassName,
  Entry,
  Equipped,
  Grant,
  ManualGrant,
  ReferenceData,
  Title,
} from "../../src/rules/types";

const CLASSES: ClassName[] = ["Warrior", "Mage", "Rogue"];

export function grantArb(ref: ReferenceData, id: string, situational?: boolean): fc.Arbitrary<Grant> {
  const slotKinds = ref.slotKinds.filter((k) => !k.retired).map((k) => k.id);
  const rarities = ref.rarities.filter((r) => !r.retired).map((r) => r.id);
  const amount = fc.integer({ min: 1, max: 20 });
  const kind = fc.oneof(
    amount.map((n) => ({ kind: "cm", amount: n }) as const),
    amount.map((n) => ({ kind: "mitigation", amount: n }) as const),
    amount.map((n) => ({ kind: "hearts", amount: n }) as const),
    fc.constantFrom("1d4", "1d6", "1d8").map((d) => ({ kind: "die", die: d }) as const),
    fc
      .tuple(fc.constantFrom(...slotKinds), fc.integer({ min: 1, max: 2 }))
      .map(([k, n]) => ({ kind: "slots", slotKind: k, amount: n }) as const),
    fc.integer({ min: 1, max: 2 }).map((n) => ({ kind: "arcane-slots", amount: n }) as const),
    fc
      .tuple(fc.constantFrom(...rarities), fc.integer({ min: 1, max: 2 }))
      .map(([r, n]) => ({ kind: "allowance", rarity: r, amount: n }) as const),
  );
  const condition =
    situational === undefined
      ? fc.option(fc.constantFrom("vs Evil", "vs fire", "ranged weapons only"), { nil: undefined, freq: 4 })
      : fc.constant(situational ? "vs Evil" : undefined);
  return fc.tuple(kind, condition).map(([k, c]) => ({ id, ...k, ...(c ? { condition: c } : {}) }) as Grant);
}

function grantsArb(ref: ReferenceData, prefix: string): fc.Arbitrary<Grant[]> {
  return fc
    .integer({ min: 0, max: 3 })
    .chain((n) => fc.tuple(...Array.from({ length: n }, (_, i) => grantArb(ref, `${prefix}-g${i}`))))
    .map((list) => [...list]);
}

function entryArb(ref: ReferenceData, characterId: string, index: number): fc.Arbitrary<Entry> {
  const id = `e${index}`;
  const base = { id, characterId, quantity: 1 };
  const armorKinds = ref.slotKinds.filter((k) => !k.retired && k.id !== "main-hand").map((k) => k.id);
  const rarity = fc.option(fc.constantFrom(...ref.rarities.filter((r) => !r.retired).map((r) => r.id)), {
    nil: undefined,
  });
  const skills = ref.skills.filter((s) => !s.retired).map((s) => s.id);
  return fc.oneof(
    fc
      .tuple(
        fc.constantFrom<1 | 2>(1, 2),
        fc.constantFrom("melee", "ranged") as fc.Arbitrary<"melee" | "ranged">,
        rarity,
        grantsArb(ref, id),
      )
      .map(
        ([hands, range, r, grants]) =>
          ({
            ...base,
            category: "weapons",
            name: `Weapon ${index}`,
            hands,
            range,
            ...(r ? { rarity: r } : {}),
            grants,
          }) as Entry,
      ),
    fc
      .tuple(fc.constantFrom(...armorKinds), rarity, grantsArb(ref, id))
      .map(
        ([slotKind, r, grants]) =>
          ({
            ...base,
            category: "armor",
            name: `Armor ${index}`,
            slotKind,
            ...(r ? { rarity: r } : {}),
            grants,
          }) as Entry,
      ),
    fc
      .tuple(fc.boolean(), rarity, grantsArb(ref, id))
      .map(
        ([arcane, r, grants]) =>
          ({ ...base, category: "items", name: `Item ${index}`, arcane, ...(r ? { rarity: r } : {}), grants }) as Entry,
      ),
    fc
      .tuple(fc.boolean(), grantsArb(ref, id))
      .map(([active, grants]) => ({ ...base, category: "allies", name: `Ally ${index}`, active, grants }) as Entry),
    fc
      .constantFrom(...skills)
      .map((skillId) => ({ ...base, category: "skills", skillId, howGained: "level-up", levelGained: 1 }) as Entry),
    fc.constant({ ...base, category: "consumables", name: `Consumable ${index}` } as Entry),
  );
}

/** Where an entry could go, ignoring whether there's room. */
export function possibleTargets(entry: Entry): string[] {
  switch (entry.category) {
    case "weapons":
      return entry.hands === 2 ? ["both-hands"] : ["main-hand", "off-hand"];
    case "armor":
      return [entry.slotKind];
    case "items":
      return entry.arcane ? ["arcane"] : [];
    default:
      return [];
  }
}

export interface SheetOptions {
  /** Leave everything unequipped (for equipping properties). */
  unequipped?: boolean;
}

/** A random character with entries, some of them equipped, titles and manual grants. */
export function sheetArb(ref: ReferenceData, options: SheetOptions = {}): fc.Arbitrary<CharacterSheet> {
  const characterId = "gen";
  return fc
    .record({
      className: fc.constantFrom(...CLASSES),
      level: fc.integer({ min: 1, max: 30 }),
      count: fc.integer({ min: 0, max: 12 }),
      titleGrants: fc.array(grantsArb(ref, "t"), { maxLength: 2 }),
      manual: fc.array(grantsArb(ref, "m"), { maxLength: 2 }),
    })
    .chain((base) =>
      fc
        .tuple(...Array.from({ length: base.count }, (_, i) => entryArb(ref, characterId, i)))
        .chain((entries) =>
          fc
            .tuple(
              ...entries.map((e) => fc.option(fc.constantFrom(...[...possibleTargets(e), "-"]), { nil: undefined })),
            )
            .map((choices) => ({ base, entries: [...entries], choices })),
        ),
    )
    .map(({ base, entries, choices }) => {
      const equipped: Equipped[] = options.unequipped
        ? []
        : entries.flatMap((e, i) => {
            const slot = choices[i];
            return slot && slot !== "-" ? [{ entryId: e.id, slot }] : [];
          });
      const titles: Title[] = base.titleGrants.map((grants, i) => ({
        id: `t${i}`,
        name: `Title ${i}`,
        scope: { level: "player" },
        grants: grants.map((g, j) => ({ ...g, id: `t${i}-g${j}` })),
      }));
      const manualGrants: ManualGrant[] = base.manual.map((grants, i) => ({
        id: `m${i}`,
        reason: `Ruling ${i}`,
        grants: grants.map((g, j) => ({ ...g, id: `m${i}-g${j}` })),
      }));
      return {
        character: { id: characterId, name: "Generated", className: base.className, level: base.level },
        entries,
        equipped,
        titles,
        manualGrants,
      };
    });
}

/** Every source that can be removed: entries, titles and manual grants. */
export type SourceKey = { type: "entry" | "title" | "manual"; id: string };

export function sourcesOf(sheet: CharacterSheet): SourceKey[] {
  return [
    ...sheet.entries.map((e) => ({ type: "entry" as const, id: e.id })),
    ...sheet.titles.map((t) => ({ type: "title" as const, id: t.id })),
    ...sheet.manualGrants.map((m) => ({ type: "manual" as const, id: m.id })),
  ];
}

export function withoutSource(sheet: CharacterSheet, source: SourceKey): CharacterSheet {
  return {
    ...sheet,
    entries: source.type === "entry" ? sheet.entries.filter((e) => e.id !== source.id) : sheet.entries,
    equipped: source.type === "entry" ? sheet.equipped.filter((q) => q.entryId !== source.id) : sheet.equipped,
    titles: source.type === "title" ? sheet.titles.filter((t) => t.id !== source.id) : sheet.titles,
    manualGrants: source.type === "manual" ? sheet.manualGrants.filter((m) => m.id !== source.id) : sheet.manualGrants,
  };
}
