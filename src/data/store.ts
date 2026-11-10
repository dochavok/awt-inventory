// The data layer (TF-2): everything the app reads and changes, for the
// signed-in user only. The in-memory fake (MemoryStore, memory-store.ts) is
// what the functional tests use; the Firestore store (M2) implements the same
// interface. Refusals throw the errors in ../errors.ts.

import type { Clock } from "../platform/clock";
import type {
  Category,
  Character,
  ClassName,
  EquipCheck,
  Grant,
  NewGrant,
  Id,
  ManualGrant,
  OverLimitAlert,
  ReferenceData,
  SheetChange,
  SkillPicker,
  SkillWarning,
  SlotTarget,
  Title,
  TitleScope,
  Totals,
  CharacterSheet,
  Entry,
  ItemEntry,
  SkillEntry,
} from "../rules/types";
import type {
  ClassCorrectionNotice,
  EntryListItem,
  EntryPatch,
  EventOptions,
  ExportFile,
  GainOptions,
  GrantTarget,
  HistoryFilter,
  HistoryRecord,
  ListFilter,
  NewCharacter,
  NewEntry,
  NewReport,
  NewSkill,
  NewTitle,
  PdfFile,
  PrintOptions,
  Profile,
  Report,
  SearchOptions,
  SearchResult,
  SheetDocument,
  SkillView,
  SyncStatus,
} from "./types";

export interface AppSettings {
  /** Whether skill card text may be shown: only once the game's owner agrees (SK-2, Q10). */
  showSkillText: boolean;
  /** The app's version, recorded on reports (SP-2). */
  appVersion: string;
}

/** Who the store acts for, and what it works with. */
export interface StoreContext {
  /** The signed-in user's uid, or null when signed out (every call is then refused). */
  currentUid: () => string | null;
  clock: Clock;
  ref: ReferenceData;
  settings: AppSettings;
}

export interface InventoryStore {
  // ---------------------------------------------------------------- account (AC, PV)
  /** Creates the signed-in user's profile at sign-up (AC-2). */
  createProfile(input: { displayName: string; email: string }): Promise<Profile>;
  profile(): Promise<Profile>;
  setDisplayName(displayName: string): Promise<Profile>;
  /** AC-5: everything goes, after typing the display name to confirm. */
  deleteAccount(typedDisplayName: string): Promise<void>;

  // ---------------------------------------------------------------- characters (CH)
  createCharacter(input: NewCharacter): Promise<Character>;
  /** Name, level and notes (CH-2); a level change is recorded in the history (CH-3). */
  updateCharacter(
    characterId: Id,
    patch: Partial<Pick<Character, "name" | "level" | "notes">>,
    options?: EventOptions,
  ): Promise<Character>;
  /** The warning shown before a class correction (CH-2a). */
  classCorrectionNotice(characterId: Id, to: ClassName): Promise<ClassCorrectionNotice>;
  correctClass(characterId: Id, to: ClassName, options: { confirmed: boolean }): Promise<Character>;
  retireCharacter(characterId: Id): Promise<void>;
  restoreCharacter(characterId: Id): Promise<void>;
  /** CH-6: after typing the character's name to confirm. */
  deleteCharacter(characterId: Id, typedName: string): Promise<void>;
  /** The main list, or the Retired list (CH-5). */
  listCharacters(list: "main" | "retired"): Promise<Character[]>;
  character(characterId: Id): Promise<Character>;

  // ---------------------------------------------------------------- titles (TI)
  addTitle(input: NewTitle): Promise<Title>;
  updateTitle(titleId: Id, patch: Partial<Pick<Title, "name" | "description" | "earned">>): Promise<Title>;
  setTitleScope(titleId: Id, scope: TitleScope): Promise<Title>;
  removeTitle(titleId: Id): Promise<void>;
  listTitles(): Promise<Title[]>;
  /** The titles that apply to a character (TI-2), and the characters a title lists (CH-5). */
  titlesFor(characterId: Id): Promise<Title[]>;
  charactersFor(titleId: Id): Promise<Character[]>;

  // ---------------------------------------------------------------- entries (IN)
  /** Adds an entry outside Skills; recorded as acquired (IN-10, IN-11). */
  addEntry(characterId: Id, entry: NewEntry, options?: GainOptions): Promise<ItemEntry>;
  /** Any field (IN-8). Raising the quantity is recorded as acquired; other edits aren't recorded. */
  updateEntry(entryId: Id, patch: EntryPatch, options?: GainOptions): Promise<ItemEntry>;
  entry(entryId: Id): Promise<Entry>;
  /** A category's entries, alphabetical, with equipped or active marked (IN-9), optionally filtered (SE-3). */
  listEntries(characterId: Id, category: Category, filter?: ListFilter): Promise<EntryListItem[]>;
  /** IN-12: a consumable or component, one fewer. */
  markUsed(entryId: Id, options?: EventOptions): Promise<HistoryRecord>;
  /** IN-13: undoes a used record. */
  restoreUsed(historyId: Id, options?: EventOptions): Promise<HistoryRecord>;
  /** IN-14: all or part of the quantity, traded or given away. */
  markTraded(
    entryId: Id,
    options: { kind: "traded" | "given-away"; quantity?: number; note?: string; date?: string },
  ): Promise<HistoryRecord>;
  /** IN-15: no trace left, but Undo works for about 10 seconds. */
  deleteEntry(entryId: Id): Promise<{ undo(): Promise<void> }>;
  /** Earlier values typed by this user for a free-text field, with the reference data's common ones (IN-2, IN-3, IN-6, IN-7, IN-11). */
  suggestions(
    field: "itemFamily" | "weaponGroup" | "allyType" | "componentTier" | "acquisitionSource",
  ): Promise<string[]>;

  // ---------------------------------------------------------------- skills (SK)
  skillPicker(characterId: Id, options: { allTrees: boolean; query?: string }): Promise<SkillPicker>;
  /** Adds a skill from the list, with any warnings (SK-1, SK-3). Unknown or retired skills are refused (SK-5, RD-3). */
  addSkill(characterId: Id, input: NewSkill): Promise<{ entry: SkillEntry; warnings: SkillWarning[] }>;
  skills(characterId: Id): Promise<SkillView[]>;
  /** SK-9: skills the list has merged or renamed, waiting for the player to accept. */
  skillReplacements(characterId: Id): Promise<{ entryId: Id; skillId: Id; replacedBy: Id[]; message: string }[]>;
  acceptReplacement(entryId: Id): Promise<SkillEntry[]>;

  // ---------------------------------------------------------------- grants and equipping (GR, EQ)
  addGrant(target: GrantTarget, grant: NewGrant): Promise<Grant>;
  addManualGrant(characterId: Id, reason: string, grants: NewGrant[]): Promise<ManualGrant>;
  removeGrant(grantId: Id): Promise<void>;
  /** Equips if allowed; otherwise changes nothing. Returns the check either way (EQ-2 to EQ-11). */
  equip(entryId: Id, target: SlotTarget): Promise<EquipCheck>;
  unequip(entryId: Id): Promise<void>;
  setActive(entryId: Id, active: boolean): Promise<void>;
  totals(characterId: Id): Promise<Totals>;
  /** Current over-limit alerts, naming the grant lost where known (EQ-8). */
  alerts(characterId: Id): Promise<OverLimitAlert[]>;
  /** The character as the rules core sees it, and the last change that may have lost a grant. */
  sheet(characterId: Id): Promise<CharacterSheet>;
  lastChange(characterId: Id): Promise<SheetChange | undefined>;

  // ---------------------------------------------------------------- history (HI)
  history(characterId: Id, filter?: HistoryFilter): Promise<HistoryRecord[]>;

  // ---------------------------------------------------------------- search and export (SE, EX)
  search(query: string, options: SearchOptions): Promise<SearchResult[]>;
  printableSheet(options: PrintOptions): Promise<SheetDocument>;
  printablePdf(options: PrintOptions): Promise<PdfFile>;
  exportJson(): Promise<ExportFile>;

  // ---------------------------------------------------------------- reports (SP)
  sendReport(input: NewReport): Promise<Report>;
  reports(): Promise<Report[]>;

  // ---------------------------------------------------------------- offline (NF-3)
  syncStatus(): Promise<SyncStatus>;
}
