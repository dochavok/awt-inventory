// Shapes the data layer stores and returns (TF-2). All times are ISO 8601 UTC
// strings ending in "Z" (NF-8).

import type {
  Category,
  Character,
  ClassName,
  Entry,
  Grant,
  NewGrant,
  HowGained,
  Id,
  ItemEntry,
  ManualGrant,
  SkillTier,
  Title,
  TitleScope,
} from "../rules/types";

export interface Profile {
  uid: string;
  displayName: string;
  email: string;
}

export interface NewCharacter {
  name: string;
  className: ClassName;
  level: number;
  notes?: string;
}

/** What the class-correction warning says it affects (CH-2a). */
export interface ClassCorrectionNotice {
  from: ClassName;
  to: ClassName;
  message: string;
  affects: ("class bonus" | "combat dice" | "hearts" | "arcane slots" | "own skill trees")[];
}

type Distribute<T> = T extends unknown ? Omit<T, "id" | "characterId" | "quantity"> & { quantity?: number } : never;
/** An entry to add, outside Skills (skills are added with addSkill, SK-1). */
export type NewEntry = Distribute<ItemEntry>;

export type EntryPatch = Partial<Omit<ItemEntry, "id" | "characterId" | "category">> & Record<string, unknown>;

export interface GainOptions {
  /** When it happened, if not now (HI-3). */
  date?: string;
  /** Acquisition source (IN-11), e.g. "Vendor". */
  source?: string;
  /** e.g. a link to the post in Discord's rewards channel (IN-11). */
  link?: string;
  note?: string;
}

export interface EventOptions {
  date?: string;
  note?: string;
}

export interface NewTitle {
  name: string;
  description?: string;
  earned?: string;
  scope?: TitleScope;
  grants?: NewGrant[];
}

export interface NewSkill {
  skillId: Id;
  howGained: HowGained;
  levelGained: number;
  notes?: string;
}

/** A character's skill as shown (SK-2): the skill list's details plus the user's own fields. */
export interface SkillView {
  entryId: Id;
  skillId: Id;
  name: string;
  tree: string;
  usage: string;
  tier: SkillTier;
  /** Only when the game's owner has agreed (SK-2, Q10). */
  text?: string;
  howGained: HowGained;
  levelGained: number;
  notes?: string;
  retired: boolean;
}

export interface EntryListItem {
  entry: Entry;
  /** Equipped, or active for an ally (IN-9). */
  equipped: boolean;
}

// ---------------------------------------------------------------- history (section 7)

export type HistoryEvent =
  "acquired" | "used" | "restored" | "traded" | "given-away" | "level-changed" | "class-corrected" | "received";

/** An entry's details when it left the inventory (IN-16). */
export interface EntrySnapshot {
  name: string;
  category: Category;
  description?: string;
  notes?: string;
  rarity?: string;
  itemFamily?: string;
  quantity: number;
}

export interface HistoryRecord {
  id: Id;
  characterId: Id;
  event: HistoryEvent;
  /** When it happened (HI-3). */
  date: string;
  /** When it was recorded (HI-3). */
  enteredAt: string;
  entryId?: Id;
  /** Name and category at the time, for display after the entry is gone. */
  entryName?: string;
  category?: Category;
  snapshot?: EntrySnapshot;
  quantity?: number;
  note?: string;
  source?: string;
  link?: string;
  /** For "restored": the "used" record it restores (IN-13). */
  restores?: Id;
  /** For level changes and class corrections, e.g. "Level 12 → 13". */
  change?: { from: number | ClassName; to: number | ClassName };
  /** A readable summary, e.g. "Class corrected: Rogue → Warrior". */
  summary: string;
}

export interface HistoryFilter {
  events?: HistoryEvent[];
  categories?: Category[];
}

// ---------------------------------------------------------------- grants

export type GrantTarget = { entryId: Id } | { titleId: Id };

// ---------------------------------------------------------------- search, export (section 10)

export interface SearchOptions {
  /** Search one character (SE-1), or all of the user's characters, retired ones included (SE-2). */
  characterId?: Id;
  allCharacters?: boolean;
}

export interface SearchResult {
  entryId: Id;
  name: string;
  category: Category;
  characterId: Id;
  characterName: string;
  /** Which fields matched: name, description, notes. */
  matched: ("name" | "description" | "notes")[];
}

export interface ListFilter {
  equipped?: boolean;
  rarity?: string;
  itemFamily?: string;
}

export interface PrintOptions {
  /** One character, or every character that isn't retired (EX-1). */
  characterIds: Id[] | "all";
  includeSkillText: boolean;
  paper: "letter" | "a4";
}

/** What the printable sheet contains, before it's laid out as a PDF (EX-1). */
export interface SheetDocument {
  createdAt: string;
  /** Printed on every page (EX-3). */
  pageFooter: string;
  characters: {
    name: string;
    className: ClassName;
    level: number;
    totals?: { label: string; value: number | string; lines: { label: string; value: number }[] }[];
    equipped: { slot: string; entry: string }[];
    categories: { category: Category; entries: { name: string; quantity: number }[] }[];
    skills: { name: string; usage: string; tier: SkillTier; text?: string }[];
    titles: { name: string; description?: string }[];
    notes?: string;
  }[];
}

export interface PdfFile {
  fileName: string;
  mimeType: "application/pdf";
  bytes: Uint8Array;
  pageCount: number;
}

export interface ExportFile {
  /** The format version (EX-4). */
  formatVersion: number;
  exportedAt: string;
  profile: { displayName: string };
  characters: {
    character: Character;
    entries: Entry[];
    equipped: { entryId: Id; slot: string }[];
    manualGrants: ManualGrant[];
    history: HistoryRecord[];
  }[];
  titles: Title[];
  todo: unknown[];
}

// ---------------------------------------------------------------- reports (SP-1 to SP-3)

export type ReportKind = "missing-skill" | "bug" | "idea" | "account-problem";

export interface NewReport {
  kind: ReportKind;
  subject: string;
  message: string;
  characterId?: Id;
}

export interface Report extends NewReport {
  id: Id;
  /** A number the maintainer and the user can refer to. */
  number: number;
  uid: string;
  sentAt: string;
  appVersion: string;
  /** "pending" until the issue (SP-2) or email (SP-3) is created. */
  delivery: "pending" | "issue-created" | "emailed";
  issueNumber?: number;
}

// ---------------------------------------------------------------- offline (NF-3)

export interface SyncStatus {
  online: boolean;
  /** Changes made offline and not yet sent. */
  pendingChanges: number;
}
