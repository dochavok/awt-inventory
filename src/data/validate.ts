// Checks on what users type, shared by every store. Each refusal is a
// ValidationError naming the field (TF-8). Maximums keep a mistake or misuse
// from running up hosting costs (NF-6).

import { ValidationError } from "../errors";
import { levelCap } from "../rules/levels";
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
  /** Also in firestore.rules, which can't import it. */
  displayName: 60,
  email: 320,
  shortText: 100,
  notes: 10_000,
  description: 10_000,
  reportSubject: 200,
  reportMessage: 10_000,
  /** A link with a gain, e.g. to a post in Discord's rewards channel (IN-11). */
  link: 2_000,
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

/** An optional link (IN-11): a web address, starting http:// or https://. */
export function webLink(field: string, value: unknown): string | undefined {
  const link = optionalText(field, value, LIMITS.link)?.trim();
  if (link === undefined) return undefined;
  if (!/^https?:\/\/\S+$/i.test(link) || !parses(link)) {
    throw new ValidationError(field, "A link must be a web address starting with http:// or https://.");
  }
  return link;
}

function parses(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
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

/** A short free-text field such as an item family or weapon group: trimmed, optional. */
function shortText(field: string, value: unknown, label = field): string | undefined {
  return optionalText(field, value, LIMITS.shortText, label)?.trim();
}

export function displayName(value: unknown): string {
  return requiredText("displayName", value, LIMITS.displayName, "display name");
}

export function email(value: unknown): string {
  return requiredText("email", value, LIMITS.email, "email address");
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

/** How far ahead of now an event date may be: enough for "today" in any time zone. */
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/** An event date (HI-3): today unless given, earlier if the user says so, and stored in UTC. */
export function eventDate(value: string | undefined, now: string): string {
  if (value === undefined) return now;
  const date = new Date(value);
  if (typeof value !== "string" || Number.isNaN(date.getTime())) {
    throw new ValidationError("date", `${String(value)} isn't a date and time.`);
  }
  if (date.getTime() > Date.parse(now) + ONE_DAY_MS) {
    throw new ValidationError("date", "An event can be dated today or earlier, not in the future.");
  }
  return toStoredTime(date);
}

/** An event's date and note, as given when recording it (HI-1, HI-3). */
export function eventOptions(
  options: { date?: string; note?: string },
  now: string,
): { date: string; note: string | undefined } {
  return { date: eventDate(options.date, now), note: optionalText("note", options.note, LIMITS.notes) };
}

/** A date earned, as an ISO 8601 date (TI-1). */
export function calendarDate(field: string, value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  // A real day: Date.parse rolls 2026-02-31 over to March, so the date must read back the same.
  const parsed = typeof value === "string" ? Date.parse(value) : NaN;
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    Number.isNaN(parsed) ||
    new Date(parsed).toISOString().slice(0, 10) !== value
  ) {
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
  set("itemFamily", shortText("itemFamily", input.itemFamily, "item family"));
  if (input.rarity !== undefined && input.rarity !== null && input.rarity !== "") {
    set("rarity", referenceId("rarity", input.rarity, ref.rarities, "rarity"));
  }
  switch (category) {
    case "weapons":
      set("hands", choice("hands", input.hands, [1, 2], "number of hands"));
      set("range", choice("range", input.range, ["melee", "ranged"], "range"));
      set("weaponGroup", shortText("weaponGroup", input.weaponGroup, "weapon group"));
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
      set("allyType", shortText("allyType", input.allyType, "type"));
      if (input.hearts !== undefined) set("hearts", wholeNumber("hearts", input.hearts, 0, LIMITS.hearts));
      set("active", choice("active", input.active, [true, false], "active setting"));
      break;
    case "components":
      set("tier", shortText("tier", input.tier));
      break;
    case "consumables":
      break;
  }
  return out as unknown as Omit<ItemEntry, "id" | "characterId">;
}
