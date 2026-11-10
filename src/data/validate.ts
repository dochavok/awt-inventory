// Checks on what users type, shared by every store. Each refusal is a
// ValidationError naming the field (TF-8). Maximums keep a mistake or misuse
// from running up hosting costs (NF-6).

import { ValidationError } from "../errors";
import { levelCap } from "../refdata";
import {
  CLASS_NAMES,
  type Category,
  type ClassName,
  type HowGained,
  type ItemEntry,
  type ReferenceData,
} from "../rules/types";
import { toStoredTime } from "../platform/time";

/** NF-6: the maximums. */
export const LIMITS = {
  name: 100,
  displayName: 60,
  shortText: 100,
  notes: 10_000,
  description: 10_000,
  reportSubject: 200,
  reportMessage: 10_000,
  quantity: 9_999,
  extraDamage: 999,
  hearts: 999,
  entriesPerCharacter: 1_000,
} as const;

/** A required single-line text: trimmed, not blank, at most `max` characters. */
export function requiredText(field: string, value: unknown, max: number, label = field): string {
  if (typeof value !== "string" || value.trim() === "") throw new ValidationError(field, `The ${label} is needed.`);
  return maxLength(field, value.trim(), max, label);
}

/** An optional text: absent or empty means none. */
export function optionalText(field: string, value: unknown, max: number, label = field): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") throw new ValidationError(field, `The ${label} must be text.`);
  return value.trim() === "" ? undefined : maxLength(field, value, max, label);
}

function maxLength(field: string, value: string, max: number, label: string): string {
  if (value.length > max) {
    throw new ValidationError(field, `The ${label} can be at most ${max.toLocaleString("en-US")} characters.`);
  }
  return value;
}

export function wholeNumber(field: string, value: unknown, min: number, max: number, label = field): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    throw new ValidationError(
      field,
      `The ${label} must be a whole number from ${min} to ${max.toLocaleString("en-US")}.`,
    );
  }
  return value;
}

export function displayName(value: unknown): string {
  return requiredText("displayName", value, LIMITS.displayName, "display name");
}

export function className(value: unknown): ClassName {
  if (!CLASS_NAMES.includes(value as ClassName)) {
    throw new ValidationError("className", `The class must be Warrior, Mage or Rogue, not ${String(value)}.`);
  }
  return value as ClassName;
}

export function level(value: unknown, ref: ReferenceData, field = "level"): number {
  return wholeNumber(field, value, 1, levelCap(ref), "level");
}

const HOW_GAINED: readonly HowGained[] = ["starting", "level-up", "quest", "trained-old-system", "other"];

export function howGained(value: unknown): HowGained {
  if (!HOW_GAINED.includes(value as HowGained)) {
    throw new ValidationError("howGained", `How gained must be one of: ${HOW_GAINED.join(", ")}.`);
  }
  return value as HowGained;
}

/** An event date (HI-3): today unless given, and stored in UTC. */
export function eventDate(value: string | undefined, now: string): string {
  if (value === undefined) return now;
  const date = new Date(value);
  if (typeof value !== "string" || Number.isNaN(date.getTime())) {
    throw new ValidationError("date", `${String(value)} isn't a date and time.`);
  }
  return toStoredTime(date);
}

/** A date earned, as an ISO 8601 date (TI-1). */
export function calendarDate(field: string, value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value))) {
    throw new ValidationError(field, `${String(value)} isn't a date like 2026-06-13.`);
  }
  return value;
}

// ---------------------------------------------------------------- entries (IN-1 to IN-7)

const COMMON = ["category", "name", "quantity", "description", "notes", "itemFamily", "grants"] as const;

/** The fields each category may have, beyond the common ones. */
const CATEGORY_FIELDS: Record<ItemEntry["category"], readonly string[]> = {
  weapons: ["rarity", "hands", "range", "weaponGroup", "extraDamage"],
  armor: ["rarity", "slotKind"],
  items: ["rarity", "arcane"],
  allies: ["allyType", "hearts", "active"],
  consumables: [],
  components: ["tier"],
};

const CATEGORY_NAMES: Record<Category, string> = {
  weapons: "Weapons",
  armor: "Armor",
  skills: "Skills",
  allies: "Familiars/Allies",
  consumables: "Consumables",
  items: "Items",
  components: "Components",
};

export function categoryName(category: Category): string {
  return CATEGORY_NAMES[category];
}

function choice<T>(field: string, value: unknown, allowed: readonly T[], label: string): T {
  if (!allowed.includes(value as T)) {
    throw new ValidationError(field, `The ${label} must be one of: ${allowed.join(", ")}.`);
  }
  return value as T;
}

function referenceId(field: string, value: unknown, list: { id: string; retired?: boolean }[], label: string) {
  const found = list.find((x) => x.id === value);
  if (!found || found.retired)
    throw new ValidationError(field, `${String(value)} isn't a ${label} that can be chosen.`);
  return found.id;
}

/**
 * An entry outside Skills, checked and tidied: required fields present, fields
 * only where its category has them, choices from the reference data. Grants are
 * left to the caller. Returns the entry's fields without id and characterId.
 */
export function itemEntry(input: Record<string, unknown>, ref: ReferenceData): Omit<ItemEntry, "id" | "characterId"> {
  const category = input.category as ItemEntry["category"];
  if (!(category in CATEGORY_FIELDS)) {
    throw new ValidationError("category", `${String(input.category)} isn't a category entries can be added to.`);
  }
  const allowed = new Set<string>([...COMMON, ...CATEGORY_FIELDS[category]]);
  for (const [field, value] of Object.entries(input)) {
    if (value !== undefined && !allowed.has(field)) {
      throw new ValidationError(field, `${categoryName(category)} entries don't have a ${field}.`);
    }
  }
  const out: Record<string, unknown> = {
    category,
    name: requiredText("name", input.name, LIMITS.name),
    quantity: input.quantity === undefined ? 1 : wholeNumber("quantity", input.quantity, 1, LIMITS.quantity),
  };
  const set = (field: string, value: unknown) => {
    if (value !== undefined) out[field] = value;
  };
  set("description", optionalText("description", input.description, LIMITS.description));
  set("notes", optionalText("notes", input.notes, LIMITS.notes));
  set("itemFamily", optionalText("itemFamily", input.itemFamily, LIMITS.shortText, "item family")?.trim());
  if (input.rarity !== undefined && input.rarity !== null && input.rarity !== "") {
    set("rarity", referenceId("rarity", input.rarity, ref.rarities, "rarity"));
  }
  switch (category) {
    case "weapons":
      set("hands", choice("hands", input.hands, [1, 2], "number of hands"));
      set("range", choice("range", input.range, ["melee", "ranged"], "range"));
      set("weaponGroup", optionalText("weaponGroup", input.weaponGroup, LIMITS.shortText, "weapon group")?.trim());
      if (input.extraDamage !== undefined) {
        set("extraDamage", wholeNumber("extraDamage", input.extraDamage, 0, LIMITS.extraDamage, "extra damage"));
      }
      break;
    case "armor":
      set("slotKind", referenceId("slotKind", input.slotKind, ref.slotKinds, "paper-doll slot"));
      break;
    case "items":
      set("arcane", choice("arcane", input.arcane, [true, false], "arcane setting"));
      break;
    case "allies":
      set("allyType", optionalText("allyType", input.allyType, LIMITS.shortText, "type")?.trim());
      if (input.hearts !== undefined) set("hearts", wholeNumber("hearts", input.hearts, 0, LIMITS.hearts));
      set("active", choice("active", input.active, [true, false], "active setting"));
      break;
    case "components":
      set("tier", optionalText("tier", input.tier, LIMITS.shortText)?.trim());
      break;
    case "consumables":
      break;
  }
  return out as unknown as Omit<ItemEntry, "id" | "characterId">;
}
