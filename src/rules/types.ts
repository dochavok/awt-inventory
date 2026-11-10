// The shapes the rules core works on and returns (TF-2). Pure data: no Firebase,
// network or UI types. Section numbers refer to inventory-requirements.md.

export type Id = string;
export type ClassName = "Warrior" | "Mage" | "Rogue";
export const CLASS_NAMES: readonly ClassName[] = ["Warrior", "Mage", "Rogue"];

/** The seven inventory categories (glossary). */
export type Category = "weapons" | "armor" | "skills" | "allies" | "consumables" | "items" | "components";

export type Permission = "weapon-use" | "ranged-weapon-use" | "armor-use" | "dual-wielding";

// ---------------------------------------------------------------- grants (8.1)

interface GrantBase {
  id: Id;
  /** Free-text condition. A grant with one is situational and never added to a total (GR-4). */
  condition?: string;
}

/** GR-1 (and GR-6 for effects). */
export type Grant = GrantBase &
  (
    | { kind: "cm"; amount: number }
    | { kind: "mitigation"; amount: number }
    | { kind: "hearts"; amount: number }
    | { kind: "die"; die: string }
    | { kind: "slots"; slotKind: Id; amount: number }
    | { kind: "arcane-slots"; amount: number }
    | { kind: "allowance"; rarity: Id; amount: number }
    | { kind: "permission"; permission: Permission }
    | { kind: "effect"; effect: "resistance" | "immunity" | "cr-bonus"; text: string }
  );

export type GrantKind = Grant["kind"];

// ---------------------------------------------------------------- characters, titles, entries

export interface Character {
  id: Id;
  name: string;
  className: ClassName;
  level: number;
  notes?: string;
  retired?: boolean;
}

/** A title applies to all the user's characters (player-level) or one (TI-2). */
export type TitleScope = { level: "player" } | { level: "character"; characterId: Id };

export interface Title {
  id: Id;
  name: string;
  description?: string;
  /** Date earned, ISO 8601 date. */
  earned?: string;
  scope: TitleScope;
  grants?: Grant[];
}

interface EntryBase {
  id: Id;
  characterId: Id;
  name: string;
  quantity: number;
  description?: string;
  notes?: string;
  /** Free text (IN-2). Not on skills. */
  itemFamily?: string;
  /** GR-2: weapons, armor, items and allies only. */
  grants?: Grant[];
}

export interface Weapon extends EntryBase {
  category: "weapons";
  rarity?: Id;
  hands: 1 | 2;
  range: "melee" | "ranged";
  weaponGroup?: string;
  /** Extra damage in hearts, shown on the weapon, never totalled (IN-3). */
  extraDamage?: number;
}

export interface Armor extends EntryBase {
  category: "armor";
  rarity?: Id;
  /** The paper-doll slot kind it fits (IN-4). A shield fits "off-hand". */
  slotKind: Id;
}

export interface Item extends EntryBase {
  category: "items";
  rarity?: Id;
  arcane: boolean;
}

export interface Ally extends EntryBase {
  category: "allies";
  allyType?: string;
  hearts?: number;
  active: boolean;
}

export interface Consumable extends EntryBase {
  category: "consumables";
}

export interface Component extends EntryBase {
  category: "components";
  tier?: string;
}

export type HowGained = "starting" | "level-up" | "quest" | "trained-old-system" | "other";

/** A skill on a character. Name, tree, text and grants come from the skill list (SK-2, SK-8). */
export interface SkillEntry {
  id: Id;
  characterId: Id;
  category: "skills";
  skillId: Id;
  howGained: HowGained;
  levelGained: number;
  notes?: string;
  quantity: 1;
}

export type Entry = Weapon | Armor | Item | Ally | Consumable | Component | SkillEntry;
export type ItemEntry = Exclude<Entry, SkillEntry>;

/**
 * Where something is equipped. A slot kind ID from the reference data (including
 * "main-hand" and "off-hand"), "both-hands" for a two-handed weapon, or "arcane".
 */
export type SlotTarget = string;

export interface Equipped {
  entryId: Id;
  slot: SlotTarget;
}

/** A grant added directly to a character, with its reason (GR-2). */
export interface ManualGrant {
  id: Id;
  reason: string;
  grants: Grant[];
}

/** Everything the rules core needs about one character. */
export interface CharacterSheet {
  character: Character;
  entries: Entry[];
  equipped: Equipped[];
  /** The titles that apply to this character: the user's player-level ones and its own. */
  titles: Title[];
  manualGrants: ManualGrant[];
}

// ---------------------------------------------------------------- reference data (13)

export interface LevelRow {
  level: number;
  classBonus: number;
  /** Dice notation, e.g. "3d20". */
  dice: string;
  hearts: number;
  skillGained: boolean;
  arcaneSlot: boolean;
}

export interface ClassChart {
  startingArcaneSlots: number;
  levels: LevelRow[];
}

export interface Retirable {
  retired?: boolean;
}

export interface SlotKind extends Retirable {
  id: Id;
  name: string;
}

export interface Rarity extends Retirable {
  id: Id;
  name: string;
  /** How many may be equipped at once; absent means no limit (EQ-10). */
  limit?: number;
  /** Lowest character level that may equip it (EQ-11). */
  minLevel?: number;
}

export interface Suggestion extends Retirable {
  id: Id;
  name: string;
  aliases?: string[];
  description?: string;
}

export interface SkillTree extends Retirable {
  id: Id;
  name: string;
  kind: string;
  classes: ClassName[];
  /** Lowest character level for the tree (e.g. prestige trees), SK-3. */
  entryLevel?: number;
  /** Maintainer note, never shown to players (RD-7). */
  maintainerNote?: string;
}

export type Prerequisite = { skill: Id } | { all: Prerequisite[] } | { any: Prerequisite[] };

export type SkillTier = "normal" | "epic" | "legendary";

export interface Skill extends Retirable {
  id: Id;
  name: string;
  tree: Id;
  usage: string;
  tier: SkillTier;
  /** Card text. Absent unless the game's owner agrees (SK-2, RD-8). */
  text?: string;
  prerequisites?: Prerequisite;
  /** How many times it can be taken (default 1), SK-3. */
  maxTimes?: number;
  /** A starting skill of its tree counts as available (SK-1a). */
  starting?: boolean;
  replacedBy?: Id[];
  maintainerNote?: string;
}

export interface SkillGrants {
  skill: Id;
  grants: Grant[];
}

export interface ReferenceData {
  levelChart: Record<ClassName, ClassChart>;
  slotKinds: SlotKind[];
  rarities: Rarity[];
  itemFamilies: Suggestion[];
  componentTiers: Suggestion[];
  acquisitionSources: Suggestion[];
  trees: SkillTree[];
  skills: Skill[];
  skillGrants: SkillGrants[];
}

// ---------------------------------------------------------------- totals (8.2)

/** The breakdown lines, in the order GR-8 shows them. */
export type BreakdownGroup =
  "class-bonus" | "level-chart" | "armor" | "weapons" | "skills" | "ally" | "items" | "titles" | "other";

export const BREAKDOWN_ORDER: readonly BreakdownGroup[] = [
  "class-bonus",
  "level-chart",
  "armor",
  "weapons",
  "skills",
  "ally",
  "items",
  "titles",
  "other",
];

export type SourceRef =
  | { type: "entry"; id: Id; name: string; category: Category }
  | { type: "skill"; id: Id; name: string; skillId: Id }
  | { type: "title"; id: Id; name: string }
  | { type: "manual"; id: Id; reason: string }
  | { type: "level-chart" };

/** One grant inside a total (GR-12). */
export interface GrantLine {
  source: SourceRef;
  group: BreakdownGroup;
  grantId?: Id;
  amount: number;
  condition?: string;
}

export interface BreakdownLine {
  group: BreakdownGroup;
  value: number;
}

export interface Total {
  value: number;
  /** Non-zero lines only, in BREAKDOWN_ORDER (GR-8). */
  lines: BreakdownLine[];
  /**
   * Every line counted in the total (GR-12), including the level chart's own
   * (the class bonus in CM, the chart's hearts in max hearts), whose source is
   * `{ type: "level-chart" }`. So `value` is always the sum of `grants`.
   */
  grants: GrantLine[];
  /** Situational grants that would affect this total; never counted (GR-4). */
  situational: GrantLine[];
}

export interface ExtraDie {
  die: string;
  source: SourceRef;
  condition?: string;
}

export type ClassBonusName = "Combat Bonus" | "Arcane Bonus" | "Stealth Bonus";

export interface Totals {
  classBonus: { name: ClassBonusName; value: number };
  cm: Total;
  mitigation: Total;
  hearts: Total;
  dice: { base: string; extra: ExtraDie[]; situational: ExtraDie[] };
  permissions: { permission: Permission; sources: SourceRef[] }[];
  /** GR-6: resistances, immunities and CR bonuses that apply now. */
  effects: { effect: "resistance" | "immunity" | "cr-bonus"; text: string; source: SourceRef; condition?: string }[];
}

// ---------------------------------------------------------------- slots and equipping (9)

export interface Occupant {
  entryId: Id;
  name: string;
}

export interface SlotView {
  /** e.g. "Back 2". */
  label: string;
  /** Where an extra slot comes from (EQ-5); absent for the standard one. */
  source?: SourceRef;
  occupant?: Occupant;
}

export interface SlotKindState {
  kind: Id;
  name: string;
  allowed: number;
  equipped: number;
  slots: SlotView[];
}

export interface ArcaneState {
  allowed: number;
  used: number;
  starting: number;
  fromLevels: number;
  grants: GrantLine[];
  occupants: Occupant[];
}

export interface RarityState {
  rarity: Id;
  name: string;
  /** null means no limit. */
  allowed: number | null;
  equipped: number;
}

export interface SlotState {
  kinds: SlotKindState[];
  arcane: ArcaneState;
  rarities: RarityState[];
}

export type BlockReason =
  | "wrong-slot"
  | "slot-full"
  | "hands-not-free"
  | "two-shields"
  | "not-arcane"
  | "arcane-full"
  | "rarity-limit"
  | "rarity-level"
  | "over-limit"
  | "cannot-equip"
  | "already-equipped";

export interface Block {
  reason: BlockReason;
  /** The slot kind, "arcane", or the rarity ID it's about. */
  about: Id;
  /** What's already there, where that's the problem. */
  occupants: Occupant[];
  message: string;
}

export interface EquipWarning {
  permission: Permission;
  message: string;
}

export interface EquipCheck {
  outcome: "allowed" | "blocked";
  block?: Block;
  warnings: EquipWarning[];
}

export type LossReason =
  | "traded"
  | "given-away"
  | "unequipped"
  | "deleted"
  | "title-moved"
  | "title-removed"
  | "grant-removed"
  | "level-lowered"
  | "class-corrected";

/** What changed, so an alert can name the grant that was lost (EQ-8). */
export interface SheetChange {
  before: CharacterSheet;
  reason: LossReason;
}

export interface OverLimitAlert {
  scope: { type: "slot-kind"; id: Id } | { type: "arcane" } | { type: "rarity"; id: Id };
  equipped: number;
  allowed: number;
  lost?: { source: SourceRef; reason: LossReason };
  message: string;
}

// ---------------------------------------------------------------- skills (6)

export interface SkillOption {
  skillId: Id;
  name: string;
  tree: Id;
  /** How many times the character already has it. */
  taken: number;
}

export interface SkillPicker {
  available: SkillOption[];
  others: SkillOption[];
}

export type SkillWarningReason = "missing-prerequisite" | "other-class" | "below-entry-level" | "already-taken";

export interface SkillWarning {
  reason: SkillWarningReason;
  /** Skills named by the warning: the missing prerequisites, or the skill itself. */
  skillIds: Id[];
  message: string;
}

/** SK-6: a level where the chart gives a skill but none was recorded. */
export interface MissingSkillLevel {
  level: number;
  message: string;
}
