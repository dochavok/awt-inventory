// The shape of each reference data file (RD-1), as zod schemas. Every object is
// strict, so a misspelled field is a format problem (RD-4).

import { z } from "zod";
import { CLASS_NAMES, type Prerequisite } from "../rules/types";

const id = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "an ID is lower-case words joined by hyphens");
const name = z.string().trim().min(1);
const count = z.number().int().min(0);
const retired = z.boolean().optional();

const levelRow = z.strictObject({
  level: z.number().int().min(1),
  classBonus: z.number().int(),
  dice: z.string().regex(/^\d+d\d+$/, "dice are written like 3d20"),
  hearts: count,
  skillGained: z.boolean(),
  arcaneSlot: z.boolean(),
});

const classChart = z.strictObject({ startingArcaneSlots: count, levels: z.array(levelRow).min(1) });

export const levelChartFile = z.strictObject({ Warrior: classChart, Mage: classChart, Rogue: classChart });

export const slotKindsFile = z.array(z.strictObject({ id, name, retired }));

export const raritiesFile = z.array(
  z.strictObject({ id, name, limit: count.optional(), minLevel: z.number().int().min(1).optional(), retired }),
);

const suggestion = z.strictObject({
  id,
  name,
  aliases: z.array(name).optional(),
  description: z.string().optional(),
  retired,
});

export const suggestionsFile = z.strictObject({
  itemFamilies: z.array(suggestion),
  componentTiers: z.array(suggestion),
  acquisitionSources: z.array(suggestion),
});

const prerequisite: z.ZodType<Prerequisite> = z.lazy(() =>
  z.union([
    z.strictObject({ skill: id }),
    z.strictObject({ all: z.array(prerequisite).min(1) }),
    z.strictObject({ any: z.array(prerequisite).min(2) }),
  ]),
);

const maintainerNote = z.string().optional();

export const skillsFile = z.strictObject({
  trees: z.array(
    z.strictObject({
      id,
      name,
      kind: name,
      classes: z.array(z.enum(CLASS_NAMES as [string, ...string[]])).min(1),
      entryLevel: z.number().int().min(1).optional(),
      maintainerNote,
      retired,
    }),
  ),
  skills: z.array(
    z.strictObject({
      id,
      name,
      tree: id,
      usage: name,
      tier: z.enum(["normal", "epic", "legendary"]),
      text: z.string().optional(),
      prerequisites: prerequisite.optional(),
      maxTimes: z.number().int().min(1).optional(),
      starting: z.boolean().optional(),
      replacedBy: z.array(id).min(1).optional(),
      maintainerNote,
      retired,
    }),
  ),
});

const grantBase = { id, condition: z.string().optional() };

const grant = z.discriminatedUnion("kind", [
  z.strictObject({ ...grantBase, kind: z.literal("cm"), amount: z.number().int() }),
  z.strictObject({ ...grantBase, kind: z.literal("mitigation"), amount: z.number().int() }),
  z.strictObject({ ...grantBase, kind: z.literal("hearts"), amount: z.number().int() }),
  z.strictObject({ ...grantBase, kind: z.literal("die"), die: z.string().regex(/^\d+d\d+$/) }),
  z.strictObject({ ...grantBase, kind: z.literal("slots"), slotKind: id, amount: z.number().int() }),
  z.strictObject({ ...grantBase, kind: z.literal("arcane-slots"), amount: z.number().int() }),
  z.strictObject({ ...grantBase, kind: z.literal("allowance"), rarity: id, amount: z.number().int() }),
  z.strictObject({
    ...grantBase,
    kind: z.literal("permission"),
    permission: z.enum(["weapon-use", "ranged-weapon-use", "armor-use", "dual-wielding"]),
  }),
  z.strictObject({
    ...grantBase,
    kind: z.literal("effect"),
    effect: z.enum(["resistance", "immunity", "cr-bonus"]),
    text: name,
  }),
]);

export const skillGrantsFile = z.array(z.strictObject({ skill: id, grants: z.array(grant).min(1) }));

/** Each file the reference data is made of, with its schema. */
export const FILES = {
  "level-chart.yaml": levelChartFile,
  "slot-kinds.yaml": slotKindsFile,
  "rarities.yaml": raritiesFile,
  "suggestions.yaml": suggestionsFile,
  "skills.yaml": skillsFile,
  "skill-grants.yaml": skillGrantsFile,
} as const;

export type FileName = keyof typeof FILES;
export type Parsed = { [F in FileName]: z.infer<(typeof FILES)[F]> };
