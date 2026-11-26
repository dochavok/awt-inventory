// Checks on what users type, shared by every store. Each refusal is a
// ValidationError naming the field (TF-8). Maximums keep a mistake or misuse
// from running up hosting costs (NF-6).

import { ValidationError } from "../errors";
import { levelCap } from "../rules/levels";
import {
  CLASS_NAMES,
  HOW_GAINED_NAMES,
  type Category,
  type ClassName,
  type HowGained,
  type ItemEntry,
  EFFECTS,
  PERMISSIONS,
  type NewGrant,
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
  hearts: 999,
  entriesPerCharacter: 1_000,
  /** Grants on one entry, title or manual grant (GR-2). Also in firestore.rules. */
  grantsPerSource: 50,
  /** Manual grants on one character (GR-2). Also in firestore.rules. */
  manualGrants: 50,
  /** A CM, mitigation, hearts or allowance grant's amount (GR-1). */
  grantAmount: 999,
  /** Slots one grant adds (GR-1). */
  slotGrant: 10,
} as const;

/** A required single-line text: trimmed, not blank, at most `max` characters. */
export function requiredText(field: string, value: unknown, max: number, label = field): string {
  if (typeof value !== "string" || value.trim() === "") throw new ValidationError(field, `The ${label} is needed.`);
  return storableText(field, value.trim(), max, label);
}

/** An optional text: absent or empty means none. */
export function optionalText(field: string, value: unknown, max: number, label = field): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") throw new ValidationError(field, `The ${label} must be text.`);
  return value.trim() === "" ? undefined : storableText(field, value, max, label);
}

/** Half of a two-part character such as an emoji: a UTF-16 surrogate without its partner. */
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

/** Text Firestore can store: at most `max` characters, with no broken character (NF-6). */
function storableText(field: string, value: string, max: number, label: string): string {
  if (value.length > max) {
    throw new ValidationError(field, `The ${label} can be at most ${max.toLocaleString("en-US")} characters.`);
  }
  // NF-6: Firestore can't store it, so it's refused here, naming the field.
  if (LONE_SURROGATE.test(value)) {
    throw new ValidationError(field, `The ${label} has a broken character, such as half of an emoji. Retype it.`);
  }
  return value;
}

/** An optional link (IN-11): a web address, starting http:// or https://. */
export function webLink(field: string, value: unknown): string | undefined {
  const link = optionalText(field, value, LIMITS.link)?.trim();
  if (link === undefined) return undefined;
  if (!isWebLink(link)) {
    throw new ValidationError(field, "A link must be a web address starting with http:// or https://.");
  }
  return link;
}

/** Whether a link is a web address the app may show as a link (IN-11). */
export function isWebLink(link: string): boolean {
  return /^https?:\/\/\S+$/i.test(link) && parses(link);
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

/** A character's name as compared with the user's other characters' names: case is ignored (CH-1). */
export function characterNameKey(name: string): string {
  return name.toLowerCase();
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

const HOW_GAINED = Object.keys(HOW_GAINED_NAMES) as HowGained[];

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
  weapons: ["rarity", "hands", "range", "weaponGroup"],
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

/** A choice from the reference data: not a retired one, unless the entry has it already (RD-3). */
function referenceId(
  field: string,
  value: unknown,
  list: { id: string; retired?: boolean }[],
  label: string,
  kept: unknown,
) {
  const found = list.find((x) => x.id === value);
  if (!found || (found.retired && value !== kept))
    throw new ValidationError(field, `${String(value)} isn't a ${label} that can be chosen.`);
  return found.id;
}

/**
 * An entry outside Skills, checked and tidied: required fields present, fields
 * only where its category has them, choices from the reference data. Grants are
 * left to the caller. Returns the entry's fields without id and characterId.
 * When editing, `before` is the entry as it was: a choice it has already stays allowed
 * after the maintainer retires it (RD-3). A number given as null is cleared (IN-8).
 */
export function itemEntry(
  input: Record<string, unknown>,
  ref: ReferenceData,
  before: Record<string, unknown> = {},
): Omit<ItemEntry, "id" | "characterId"> {
  const category = input.category as ItemEntry["category"];
  if (!(category in CATEGORY_FIELDS)) {
    throw new ValidationError("category", `${String(input.category)} isn't a category entries can be added to.`);
  }
  // IN-3: the earlier field is refused with where extra damage goes now, not as an unknown field.
  if (category === "weapons" && input.extraDamage !== undefined) {
    throw new ValidationError("extraDamage", "A weapon's extra damage is a grant now: add it under Grants.");
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
    set("rarity", referenceId("rarity", input.rarity, ref.rarities, "rarity", before.rarity));
  }
  switch (category) {
    case "weapons":
      set("hands", choice("hands", input.hands, [1, 2], "number of hands"));
      set("range", choice("range", input.range, ["melee", "ranged"], "range"));
      set("weaponGroup", shortText("weaponGroup", input.weaponGroup, "weapon group"));
      break;
    case "armor":
      set("slotKind", referenceId("slotKind", input.slotKind, ref.slotKinds, "paper-doll slot", before.slotKind));
      break;
    case "items":
      set("arcane", choice("arcane", input.arcane, [true, false], "arcane setting"));
      break;
    case "allies":
      set("allyType", shortText("allyType", input.allyType, "type"));
      if (input.hearts !== undefined && input.hearts !== null) {
        set("hearts", wholeNumber("hearts", input.hearts, 0, LIMITS.hearts));
      }
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

// ---------------------------------------------------------------- grants (GR-1, GR-2)

/** GR-2: the categories whose entries can carry grants. */
const GRANT_CATEGORIES: readonly Category[] = ["weapons", "armor", "items", "allies"];

/** Refuses grants on an entry whose category can't have them (GR-2), naming the category. */
export function grantsAllowed(category: Category): void {
  if (!GRANT_CATEGORIES.includes(category)) {
    throw new ValidationError(
      "grants",
      `${categoryName(category)} entries can't have grants: only Weapons, Armor, Items and Familiars/Allies can.`,
    );
  }
}

/** NF-6: refuses `count` of something above its `max`, e.g. "One source can have at most 50 grants." */
export function atMost(count: number, max: number, field: string, owner: string, things: string): void {
  if (count > max) throw new ValidationError(field, `${owner} can have at most ${max} ${things}.`);
}

/** Dice notation for one die, e.g. 1d6 (GR-1, GR-11). */
const DIE = /^[1-9]\d?d[1-9]\d{0,2}$/;

/** The fields each kind of grant has, beyond `kind` and an optional `condition`. */
const GRANT_FIELDS: Record<NewGrant["kind"], readonly string[]> = {
  cm: ["amount"],
  mitigation: ["amount"],
  hearts: ["amount"],
  die: ["die"],
  slots: ["slotKind", "amount"],
  "arcane-slots": ["amount"],
  allowance: ["rarity", "amount"],
  permission: ["permission"],
  "extra-damage": ["amount", "damageType"],
  effect: ["effect", "text"],
};

/**
 * One grant, checked: a kind from GR-1 (or an effect, GR-6), a whole amount of
 * 1 or more, a die like 1d6, a slot kind or rarity from the reference data that
 * isn't retired, an optional damage type (GR-13), and an optional condition
 * (GR-4). Every refusal names `grants`.
 */
export function grant(input: unknown, ref: ReferenceData): NewGrant {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new ValidationError("grants", "A grant must say what it gives.");
  }
  const g = input as Record<string, unknown>;
  const kind = g.kind as NewGrant["kind"];
  if (typeof kind !== "string" || !Object.hasOwn(GRANT_FIELDS, kind)) {
    throw new ValidationError("grants", `${String(g.kind)} isn't a kind of grant.`);
  }
  const allowed = new Set(["kind", "condition", "id", ...GRANT_FIELDS[kind]]);
  for (const [field, value] of Object.entries(g)) {
    if (value !== undefined && !allowed.has(field)) {
      // TODO: wording: "A effect grant doesn't have a amount." needs "a"/"an" and the kind's
      // display name. The grant form can't reach it today.
      throw new ValidationError("grants", `A ${kind} grant doesn't have a ${field}.`);
    }
  }
  const amount = (max: number = LIMITS.grantAmount) => wholeNumber("grants", g.amount, 1, max, "grant's amount");
  let out: NewGrant;
  switch (kind) {
    case "cm":
    case "mitigation":
    case "hearts":
    case "arcane-slots":
      out = { kind, amount: amount(kind === "arcane-slots" ? LIMITS.slotGrant : LIMITS.grantAmount) };
      break;
    case "die":
      if (typeof g.die !== "string" || !DIE.test(g.die.trim())) {
        throw new ValidationError("grants", `${String(g.die)} isn't a die like 1d6.`);
      }
      out = { kind, die: g.die.trim() };
      break;
    case "slots":
      out = {
        kind,
        slotKind: referenceId("grants", g.slotKind, ref.slotKinds, "paper-doll slot", undefined),
        amount: amount(LIMITS.slotGrant),
      };
      break;
    case "allowance":
      out = { kind, rarity: referenceId("grants", g.rarity, ref.rarities, "rarity", undefined), amount: amount() };
      break;
    case "permission":
      out = { kind, permission: choice("grants", g.permission, PERMISSIONS, "permission") };
      break;
    case "extra-damage": {
      const damageType = shortText("grants", g.damageType, "damage type");
      out = { kind, amount: amount(), ...(damageType ? { damageType } : {}) };
      break;
    }
    case "effect":
      out = {
        kind,
        effect: choice("grants", g.effect, EFFECTS, "effect"),
        text: requiredText("grants", g.text, LIMITS.shortText, "effect's text"),
      };
      break;
  }
  const condition = optionalText("grants", g.condition, LIMITS.shortText, "condition")?.trim();
  if (condition) out.condition = condition;
  return out;
}

/** A list of grants for one source: each checked, at most `LIMITS.grantsPerSource` (NF-6). */
export function grantList(input: unknown, ref: ReferenceData): NewGrant[] {
  if (input === undefined || input === null) return [];
  if (!Array.isArray(input)) throw new ValidationError("grants", "Grants must be a list.");
  atMost(input.length, LIMITS.grantsPerSource, "grants", "One source", "grants");
  return input.map((g) => grant(g, ref));
}
