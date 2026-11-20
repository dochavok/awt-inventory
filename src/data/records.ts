// The data layer's logic (TF-2), shared by every store: what each action
// checks, reads and changes. Where the records live is the backend's job
// (backend.ts): the in-memory database in tests, Firestore in the app.
//
// Methods for later milestones throw NotImplementedError naming the milestone.

import { AccessDeniedError, ConfirmationError, NotFoundError, RateLimitError, ValidationError } from "../errors";
import { toStoredTime } from "../platform/time";
import { checkEquip, computeTotals, fitsSlot, overLimitAlerts, slotState } from "../rules";
import { addsSlots, entryName as nameOf, titleApplies } from "../rules/grants";
import { placements, skillPicker as pickSkills, skillRetired, skillWarnings } from "../rules/skills";
import type {
  CharacterSheet,
  Character,
  ClassName,
  Entry,
  EquipCheck,
  Grant,
  Id,
  ItemEntry,
  LossReason,
  ManualGrant,
  NewGrant,
  OverLimitAlert,
  SheetChange,
  SkillEntry,
  SkillGrant,
  SlotTarget,
  Title,
  TitleScope,
} from "../rules/types";
import type { Backend, Change, NotMine, StoredCharacter, StoredEntry, StoredRecord } from "./backend";
import { matchesFilter, searchEntries } from "./search";
import { buildSheet, byName, renderPdf } from "./sheet";
import { later as laterIn, requireUid, type InventoryStore, type StoreContext } from "./store";
import type {
  EntryListItem,
  EntrySnapshot,
  ExportFile,
  GainOptions,
  HistoryRecord,
  PrintOptions,
  Profile,
  Report,
  GrantTarget,
  SkillView,
} from "./types";
import { REPORT_KINDS, REPORTS_PER_DAY } from "./types";
import * as check from "./validate";

/** IN-15: how long Undo works after a hard delete. */
export const UNDO_SECONDS = 10;

/** EX-4: the JSON export's format version. */
const EXPORT_FORMAT_VERSION = 1;

/** An entry or character as the app sees it: without what only the store keeps (backend.ts). */
function plainEntry(stored: StoredEntry): Entry {
  const { slot: _slot, ...entry } = stored;
  return entry as Entry;
}

function plainCharacter(stored: StoredCharacter): Character {
  const { manualGrants: _manual, ...character } = stored;
  return character;
}

/** The fields that decide where an entry can be equipped (EQ-2, EQ-3, EQ-7). */
const PLACEMENT = ["slotKind", "arcane", "hands"];

/** Whether an edit's grants are the entry's own, whatever the order of their fields (an absent list is empty). */
function sameGrants(given: unknown, kept: Grant[] | undefined): boolean {
  if (!Array.isArray(given) || !given.every((g) => typeof g === "object" && g !== null)) return false;
  const canonical = (list: object[]) =>
    JSON.stringify(
      list.map((g) =>
        Object.entries(g)
          .filter(([, v]) => v !== undefined)
          .sort(([a], [b]) => a.localeCompare(b)),
      ),
    );
  return canonical(given as object[]) === canonical(kept ?? []);
}

/** Newest first; records made together keep the order they were made in (HI-1). */
const newestFirst = (a: StoredRecord, b: StoredRecord) => b.record.date.localeCompare(a.record.date) || b.seq - a.seq;

/** Removes undefined fields, as a stored record has none. */
function tidy<T extends object>(value: T): T {
  for (const key of Object.keys(value) as (keyof T)[]) if (value[key] === undefined) delete value[key];
  return value;
}

/** The fields that differ between two versions of a record; undefined where a field was removed. */
function changedFields(before: object, after: object, skip: string[]): Record<string, unknown> {
  const a = before as Record<string, unknown>;
  const b = after as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (skip.includes(key)) continue;
    if (JSON.stringify(a[key]) !== JSON.stringify(b[key])) out[key] = b[key];
  }
  return out;
}

export function createRecordsStore(backend: Backend, context: StoreContext, label: string): InventoryStore {
  const { clock, ref, settings } = context;
  const now = () => toStoredTime(clock.now());
  const later = (what: string, milestone: string) => laterIn(`${label}.${what}`, milestone);

  // ---------------------------------------------------------------- access (PV-1)

  const uid = () => requireUid(context);

  function mine<T>(found: T | NotMine | undefined, kind: string, id: Id, refusal: string): T {
    if (found === undefined) throw new NotFoundError(kind, id);
    if (found === "not-mine") throw new AccessDeniedError(refusal);
    return found;
  }

  async function ownProfile(): Promise<Profile> {
    const me = uid();
    const profile = await backend.profile();
    if (!profile) throw new NotFoundError("profile", me);
    return profile;
  }

  /** The character as stored, with its manual grants. */
  async function storedCharacter(characterId: Id): Promise<StoredCharacter> {
    uid();
    return mine(await backend.character(characterId), "character", characterId, "That character isn't yours.");
  }

  async function ownCharacter(characterId: Id): Promise<Character> {
    return plainCharacter(await storedCharacter(characterId));
  }

  /** The entry as stored, with where it's equipped; one used up or traded away isn't found. */
  async function storedEntry(entryId: Id): Promise<StoredEntry> {
    uid();
    const entry = mine(await backend.entry(entryId), "entry", entryId, "That character isn't yours.");
    if (entry.quantity <= 0) throw new NotFoundError("entry", entryId);
    return entry;
  }

  async function ownEntry(entryId: Id): Promise<Entry> {
    return plainEntry(await storedEntry(entryId));
  }

  async function ownTitle(titleId: Id): Promise<Title> {
    uid();
    return mine(await backend.title(titleId), "title", titleId, "That title isn't yours.");
  }

  async function storedCharacters(): Promise<StoredCharacter[]> {
    uid();
    return backend.characters();
  }

  async function myCharacters(): Promise<Character[]> {
    return (await storedCharacters()).map(plainCharacter);
  }

  async function myTitles(): Promise<Title[]> {
    uid();
    return backend.titles();
  }

  /** A character's entries still in the inventory (quantity above 0), as stored. */
  const storedEntriesOf = async (characterId: Id): Promise<StoredEntry[]> =>
    (await backend.entries(characterId)).filter((e) => e.quantity > 0);

  /** A character's entries still in the inventory (quantity above 0). */
  const entriesOf = async (characterId: Id) => (await storedEntriesOf(characterId)).map(plainEntry);

  const write = (changes: Change[]) => backend.write(changes);

  // ---------------------------------------------------------------- names and history

  const entryName = (entry: Entry) => nameOf(entry, ref);

  function snapshot(entry: ItemEntry, quantity: number): EntrySnapshot {
    const s: EntrySnapshot = { name: entry.name, category: entry.category, quantity };
    if (entry.description !== undefined) s.description = entry.description;
    if (entry.notes !== undefined) s.notes = entry.notes;
    if ("rarity" in entry && entry.rarity !== undefined) s.rarity = entry.rarity;
    if (entry.itemFamily !== undefined) s.itemFamily = entry.itemFamily;
    return s;
  }

  /** A new history record, and the change that stores it. */
  function record(
    characterId: Id,
    fields: Omit<HistoryRecord, "id" | "characterId" | "enteredAt">,
  ): { record: HistoryRecord; change: Change } {
    const r = tidy<HistoryRecord>({
      id: backend.newId("history", characterId),
      characterId,
      enteredAt: now(),
      ...fields,
    });
    return { record: r, change: { op: "set-history", value: { seq: backend.nextSeq(), record: r } } };
  }

  function aboutEntry(entry: Entry) {
    return { entryId: entry.id, entryName: entryName(entry), category: entry.category };
  }

  /** A gain's date, note, source and link, checked before anything is stored (HI-3, IN-11). */
  function gainOptions(options: GainOptions) {
    return {
      ...check.eventOptions(options, now()),
      source: check.optionalText("source", options.source, check.LIMITS.shortText, "source")?.trim(),
      link: check.webLink("link", options.link),
    };
  }

  function acquired(entry: Entry, quantity: number, gain: ReturnType<typeof gainOptions>) {
    return record(entry.characterId, {
      event: "acquired",
      ...gain,
      ...aboutEntry(entry),
      quantity,
      summary: `Acquired ${quantity} × ${entryName(entry)}`,
    });
  }

  // ---------------------------------------------------------------- characters (CH)

  async function uniqueName(name: string, except?: Id): Promise<void> {
    const key = check.characterNameKey(name);
    const clash = (await myCharacters()).find((c) => c.id !== except && check.characterNameKey(c.name) === key);
    if (clash) throw new ValidationError("name", `You already have a character called ${clash.name}.`);
  }

  /** NF-6: refuses another entry when a character already has the most it can (`entries` are its own). */
  function checkCount(entries: Entry[]): void {
    if (entries.length >= check.LIMITS.entriesPerCharacter) {
      throw new ValidationError(
        "entries",
        `A character can have at most ${check.LIMITS.entriesPerCharacter.toLocaleString("en-US")} entries.`,
      );
    }
  }

  // ---------------------------------------------------------------- grants (GR-1, GR-2)

  /** Grants for a new source, checked and given their IDs. */
  function newGrants(input: unknown): Grant[] {
    return check.grantList(input, ref).map((g) => ({ ...g, id: backend.newId("grant") }) as Grant);
  }

  /** One more grant on a source that has `existing`, checked (GR-1) and within the limit (NF-6). */
  function oneMore(existing: Grant[] | undefined, input: NewGrant): Grant[] {
    const list = existing ?? [];
    check.atMost(list.length + 1, check.LIMITS.grantsPerSource, "grants", "One source", "grants");
    return [...list, { ...check.grant(input, ref), id: backend.newId("grant") } as Grant];
  }

  // ---------------------------------------------------------------- the last change (EQ-8)

  /**
   * The last change that may have lost a slot, per character, so an alert can name
   * it. Kept on this phone for this session only: after the app is reopened, an alert
   * shows without its cause (EQ-8 "where known").
   */
  const lastChanges = new Map<Id, SheetChange>();

  /** An entry's grants: its own, or a skill's from the skill list (SK-7). */
  /** The grants the user gave an entry (GR-2); a skill has none of its own. */
  const ownGrants = (entry: Entry): Grant[] | undefined => (entry.category === "skills" ? undefined : entry.grants);

  function grantsOf(entry: Entry): SkillGrant[] | undefined {
    if (entry.category === "skills") return ref.skillGrants.find((s) => s.skill === entry.skillId)?.grants;
    return ownGrants(entry);
  }

  /** Whether losing these grants can take slots away, the only way a change raises an alert (EQ-8). */
  const losesSlots = (grants: SkillGrant[] | undefined) => grants?.some(addsSlots) === true;

  /** Whether an entry's grants count now (GR-3): a skill's always, others while equipped or active. */
  function countsNow(entry: StoredEntry): boolean {
    if (entry.category === "skills") return true;
    if (entry.category === "allies") return entry.active;
    return equippedAt(entry) !== undefined;
  }

  /**
   * Where an entry is equipped: its stored slot, if the entry fits there. Two phones'
   * changes merged (NF-3) can leave one stored in a slot it no longer fits (EQ-4), and it
   * then counts as unequipped until it's equipped again.
   */
  function equippedAt(entry: StoredEntry): SlotTarget | undefined {
    return entry.slot !== undefined && fitsSlot(entry, entry.slot) ? entry.slot : undefined;
  }

  /** The character an entry's change can take slots from: its own, if the entry's slot grants count now. */
  const losingFrom = (entry: StoredEntry): Id[] =>
    countsNow(entry) && losesSlots(grantsOf(entry)) ? [entry.characterId] : [];

  /**
   * Writes `changes`. For each of `characterIds` (the characters the change can take
   * slots from), keeps the sheet as it was and why it changed, so an alert can name the
   * slot lost (EQ-8). Kept before the write, so a screen that reads the alerts as the
   * change lands sees its cause, and put back as it was if the write fails. Returns the
   * causes it kept, so whoever undoes the change can forget just those.
   */
  async function writeLosing(changes: Change[], reason: LossReason, characterIds: Id[]): Promise<SheetChange[]> {
    const titles = characterIds.length > 0 ? await myTitles() : [];
    const sheets = await Promise.all(characterIds.map((id) => sheetFor(id, titles)));
    const kept = sheets.map((before) => ({
      id: before.character.id,
      earlier: lastChanges.get(before.character.id),
      mine: { before, reason },
    }));
    for (const k of kept) lastChanges.set(k.id, k.mine);
    try {
      await write(changes);
    } catch (error) {
      // Only where it's still this change's cause: another change since keeps its own.
      for (const k of kept) {
        if (lastChanges.get(k.id) !== k.mine) continue;
        if (k.earlier) lastChanges.set(k.id, k.earlier);
        else lastChanges.delete(k.id);
      }
      throw error;
    }
    return kept.map((k) => k.mine);
  }

  /** Forgets `change` as its character's cause, if it still is (a later change keeps its own). */
  function forget(change: SheetChange): void {
    const id = change.before.character.id;
    if (lastChanges.get(id) === change) lastChanges.delete(id);
  }

  /** The characters a title's grants count for (TI-5). */
  async function charactersUnder(scope: TitleScope): Promise<Id[]> {
    // A character-level title can outlive its character (CH-6 keeps it if the delete fails part-way).
    return (await myCharacters()).map((c) => c.id).filter((id) => titleApplies(scope, id));
  }

  /** The class a correction changes to (CH-2a): a class, and not the one the character has. */
  function classCorrection(character: Character, to: unknown): ClassName {
    const className = check.className(to);
    if (className === character.className) {
      throw new ValidationError("className", `${character.name} is already a ${className}.`);
    }
    return className;
  }

  function correctionMessage(from: ClassName, to: ClassName): string {
    return (
      `A class can't change in the game, so only correct it if ${from} was a mistake when the character was created. ` +
      `Changing it to ${to} changes the class bonus, combat dice, hearts and arcane slots, ` +
      `and which skills are in the character's own trees.`
    );
  }

  function update(kind: "character" | "entry" | "title", id: Id, fields: Record<string, unknown>): Change[] {
    return Object.keys(fields).length === 0 ? [] : [{ op: "update", kind, id, fields, at: now() }];
  }

  // ---------------------------------------------------------------- skills (SK)

  function skillView(entry: SkillEntry): SkillView {
    const skill = ref.skills.find((s) => s.id === entry.skillId);
    // SK-2: every tree, for a skill in several, in the skill list's order.
    const trees = (skill ? placements(skill) : []).map((p) => ref.trees.find((t) => t.id === p.tree)?.name ?? p.tree);
    const view: SkillView = {
      entryId: entry.id,
      skillId: entry.skillId,
      name: skill?.name ?? entry.skillId,
      tree: trees.join(", "),
      usage: skill?.usage ?? "",
      tier: skill?.tier ?? "normal",
      howGained: entry.howGained,
      levelGained: entry.levelGained,
      retired: skill?.retired ?? false,
    };
    if (settings.showSkillText && skill?.text !== undefined) view.text = skill.text;
    if (entry.notes !== undefined) view.notes = entry.notes;
    return view;
  }

  /** The character as the rules core sees it: entries, where they're equipped, titles and manual grants. */
  function sheetOf(stored: StoredCharacter, entries: StoredEntry[], titles: Title[]): CharacterSheet {
    return {
      character: plainCharacter(stored),
      entries: entries.map(plainEntry),
      equipped: entries.flatMap((e) => {
        const slot = equippedAt(e);
        return slot === undefined ? [] : [{ entryId: e.id, slot }];
      }),
      titles: applying(titles, stored.id),
      manualGrants: stored.manualGrants ?? [],
    };
  }

  /** sheetOf, read: `titles` are the user's titles where the caller has them already. */
  async function sheetFor(characterId: Id, titles?: Title[]): Promise<CharacterSheet> {
    const [stored, entries, all] = await Promise.all([
      storedCharacter(characterId),
      storedEntriesOf(characterId),
      titles ?? myTitles(),
    ]);
    return sheetOf(stored, entries, all);
  }

  /** The sheet and its alerts, from one read (NF-5). */
  async function sheetWithAlerts(characterId: Id): Promise<{ sheet: CharacterSheet; alerts: OverLimitAlert[] }> {
    const cause = lastChanges.get(characterId);
    const sheet = await sheetFor(characterId);
    const alerts = overLimitAlerts(sheet, ref, cause);
    // With nothing over its limit, the cause is done with: a later alert has a cause of its own.
    // Unless a change made during the read has kept a new one.
    if (alerts.length === 0 && cause) forget(cause);
    return { sheet, alerts };
  }

  /** Equips an entry of `sheet` in the first of `targets` that allows it, checking each against that one read (NF-5). */
  async function equipOnSheet(sheet: CharacterSheet, entryId: Id, targets: SlotTarget[]): Promise<EquipCheck[]> {
    const checks: EquipCheck[] = [];
    for (const target of targets) {
      const result = checkEquip(sheet, ref, entryId, target);
      checks.push(result);
      if (result.outcome === "allowed") {
        await write(update("entry", entryId, { slot: target }));
        break;
      }
    }
    return checks;
  }

  // ---------------------------------------------------------------- grant sources (GR-2)

  /** Where a grant goes, or is: an entry as stored, or a title. */
  type GrantSource = { kind: "entry"; entry: StoredEntry } | { kind: "title"; title: Title };

  const sourceId = (source: GrantSource) => (source.kind === "entry" ? source.entry.id : source.title.id);
  const sourceGrants = (source: GrantSource): Grant[] =>
    (source.kind === "entry" ? ownGrants(source.entry) : source.title.grants) ?? [];

  async function grantSource(target: GrantTarget): Promise<GrantSource> {
    if ("entryId" in target) return { kind: "entry", entry: await storedEntry(target.entryId) };
    if ("titleId" in target) return { kind: "title", title: await ownTitle(target.titleId) };
    throw new ValidationError("target", "A grant goes on an entry or a title.");
  }

  /** GR-5: a removed grant stops counting at once, which may raise an alert (EQ-8). One not on `source` isn't found. */
  async function removeFrom(source: GrantSource, grantId: Id): Promise<void> {
    const all = sourceGrants(source);
    const grant = all.find((g) => g.id === grantId);
    if (!grant) throw new NotFoundError("grant", grantId);
    let losing: Id[] = [];
    if (losesSlots([grant])) {
      if (source.kind === "title") losing = await charactersUnder(source.title.scope);
      else if (countsNow(source.entry)) losing = [source.entry.characterId];
    }
    const grants = all.filter((g) => g.id !== grantId);
    await writeLosing(update(source.kind, sourceId(source), { grants }), "grant-removed", losing);
  }

  // ---------------------------------------------------------------- titles (TI)

  /** The titles that apply to a character: player-level ones and its own, by name. */
  function applying(titles: Title[], characterId: Id): Title[] {
    return titles.filter((t) => titleApplies(t.scope, characterId)).sort(byName);
  }

  async function checkScope(scope: TitleScope | undefined): Promise<TitleScope> {
    if (scope === undefined || scope.level === "player") return { level: "player" };
    if (scope.level !== "character") throw new ValidationError("scope", "A title is player-level or character-level.");
    await ownCharacter(scope.characterId);
    return { level: "character", characterId: scope.characterId };
  }

  /**
   * Everything in a character, in an order a backend can apply in parts: its
   * entries, their records, the character, its other records, then its
   * character-level titles.
   */
  async function removeCharacterData(characterId: Id): Promise<Change[]> {
    const [entries, history, titles] = await Promise.all([
      backend.entries(characterId),
      backend.history(characterId),
      myTitles(),
    ]);
    const del = (kind: "entry" | "history" | "character" | "title", id: Id): Change => ({ op: "delete", kind, id });
    return [
      ...entries.map((e) => del("entry", e.id)),
      ...history.filter((h) => h.record.entryId !== undefined).map((h) => del("history", h.record.id)),
      del("character", characterId),
      ...history.filter((h) => h.record.entryId === undefined).map((h) => del("history", h.record.id)),
      ...titles
        .filter((t) => t.scope.level === "character" && t.scope.characterId === characterId)
        .map((t) => del("title", t.id)),
    ];
  }

  /** The characters a search or sheet covers, with their entries in the inventory. */
  async function withEntries(characters: Character[]) {
    return Promise.all(characters.map(async (character) => ({ character, entries: await entriesOf(character.id) })));
  }

  const store: InventoryStore = {
    // ---------------------------------------------------------------- account (AC, PV)
    async createProfile(input) {
      const profile: Profile = {
        uid: uid(),
        displayName: check.displayName(input.displayName),
        email: check.email(input.email),
      };
      await backend.createProfile(profile);
      return profile;
    },

    profile: ownProfile,

    async setDisplayName(name) {
      const displayName = check.displayName(name);
      const profile = await ownProfile();
      await backend.setDisplayName(displayName);
      return { ...profile, displayName };
    },

    async deleteAccount(typed) {
      const profile = await ownProfile();
      if (typed.trim() !== profile.displayName) {
        throw new ConfirmationError(profile.displayName, `Type your display name, ${profile.displayName}, to confirm.`);
      }
      await backend.deleteAccount();
    },

    // ---------------------------------------------------------------- characters (CH)
    async createCharacter(input) {
      uid();
      const name = check.requiredText("name", input.name, check.LIMITS.name);
      const character: Character = {
        id: backend.newId("character"),
        name,
        className: check.className(input.className),
        level: check.level(input.level, ref),
      };
      const notes = check.optionalText("notes", input.notes, check.LIMITS.notes);
      if (notes !== undefined) character.notes = notes;
      await uniqueName(name);
      await write([{ op: "set-character", value: character }]);
      return character;
    },

    async updateCharacter(characterId, patch, options = {}) {
      const character = await ownCharacter(characterId);
      const next = { ...character };
      if (patch.name !== undefined) {
        next.name = check.requiredText("name", patch.name, check.LIMITS.name);
        if (next.name !== character.name) await uniqueName(next.name, characterId);
      }
      if (patch.level !== undefined) next.level = check.level(patch.level, ref);
      if (patch.notes !== undefined) {
        const notes = check.optionalText("notes", patch.notes, check.LIMITS.notes);
        if (notes === undefined) delete next.notes;
        else next.notes = notes;
      }
      const { date, note } = check.eventOptions(options, now());
      const changes = update("character", characterId, changedFields(character, next, ["id"]));
      if (next.level !== character.level) {
        changes.push(
          record(characterId, {
            event: "level-changed",
            date,
            change: { from: character.level, to: next.level },
            note,
            summary: `Level ${character.level} → ${next.level}`,
          }).change,
        );
      }
      // EQ-8: a lower level can mean fewer arcane slots.
      await writeLosing(changes, "level-lowered", next.level < character.level ? [characterId] : []);
      return next;
    },

    async classCorrectionNotice(characterId, to) {
      const character = await ownCharacter(characterId);
      const className = classCorrection(character, to);
      return {
        from: character.className,
        to: className,
        message: correctionMessage(character.className, className),
        affects: ["class bonus", "combat dice", "hearts", "arcane slots", "own skill trees"],
      };
    },

    async correctClass(characterId, to, options) {
      const character = await ownCharacter(characterId);
      const className = classCorrection(character, to);
      if (options.confirmed !== true) {
        throw new ConfirmationError("confirmed", correctionMessage(character.className, className));
      }
      const corrected = record(characterId, {
        event: "class-corrected",
        date: now(),
        change: { from: character.className, to: className },
        summary: `Class corrected: ${character.className} → ${className}`,
      });
      await writeLosing([corrected.change, ...update("character", characterId, { className })], "class-corrected", [
        characterId,
      ]);
      return { ...character, className };
    },

    async retireCharacter(characterId) {
      await ownCharacter(characterId);
      await write(update("character", characterId, { retired: true }));
    },

    async restoreCharacter(characterId) {
      const character = await ownCharacter(characterId);
      if (character.retired !== undefined) await write(update("character", characterId, { retired: undefined }));
    },

    async deleteCharacter(characterId, typedName) {
      const character = await ownCharacter(characterId);
      if (typedName.trim() !== character.name) {
        throw new ConfirmationError(character.name, `Type the character's name, ${character.name}, to confirm.`);
      }
      await write(await removeCharacterData(characterId));
    },

    async listCharacters(list) {
      const retired = list === "retired";
      return (await myCharacters()).filter((c) => (c.retired === true) === retired).sort(byName);
    },

    character: ownCharacter,

    // ---------------------------------------------------------------- titles (TI)
    async addTitle(input) {
      uid();
      const title: Title = {
        id: backend.newId("title"),
        name: check.requiredText("name", input.name, check.LIMITS.name),
        scope: await checkScope(input.scope),
      };
      const grants = newGrants(input.grants);
      if (grants.length > 0) title.grants = grants;
      const description = check.optionalText("description", input.description, check.LIMITS.description);
      if (description !== undefined) title.description = description;
      const earned = check.calendarDate("earned", input.earned);
      if (earned !== undefined) title.earned = earned;
      await write([{ op: "set-title", value: title }]);
      return title;
    },

    async updateTitle(titleId, patch) {
      const before = await ownTitle(titleId);
      const title = { ...before };
      if (patch.name !== undefined) title.name = check.requiredText("name", patch.name, check.LIMITS.name);
      if (patch.description !== undefined) {
        const description = check.optionalText("description", patch.description, check.LIMITS.description);
        if (description === undefined) delete title.description;
        else title.description = description;
      }
      if (patch.earned !== undefined) {
        const earned = check.calendarDate("earned", patch.earned);
        if (earned === undefined) delete title.earned;
        else title.earned = earned;
      }
      await write(update("title", titleId, changedFields(before, title, ["id"])));
      return title;
    },

    async setTitleScope(titleId, scope) {
      const title = await ownTitle(titleId);
      const checked = await checkScope(scope);
      // EQ-8: the characters it no longer applies to lose its slots.
      const losing = losesSlots(title.grants)
        ? (await charactersUnder(title.scope)).filter((id) => !titleApplies(checked, id))
        : [];
      await writeLosing(update("title", titleId, { scope: checked }), "title-moved", losing);
      return { ...title, scope: checked };
    },

    async removeTitle(titleId) {
      const title = await ownTitle(titleId);
      const losing = losesSlots(title.grants) ? await charactersUnder(title.scope) : [];
      await writeLosing([{ op: "delete", kind: "title", id: titleId }], "title-removed", losing);
    },

    async listTitles() {
      return (await myTitles()).sort(byName);
    },

    async titlesFor(characterId) {
      await ownCharacter(characterId);
      return applying(await myTitles(), characterId);
    },

    async charactersFor(titleId) {
      const title = await ownTitle(titleId);
      const scope = title.scope;
      const characters = await myCharacters();
      return (scope.level === "player" ? characters : characters.filter((c) => c.id === scope.characterId)).sort(
        byName,
      );
    },

    // ---------------------------------------------------------------- entries (IN)
    async addEntry(characterId, input, options = {}) {
      await ownCharacter(characterId);
      const fields = check.itemEntry(input as unknown as Record<string, unknown>, ref);
      const given = (input as { grants?: unknown }).grants;
      if (Array.isArray(given) && given.length > 0) check.grantsAllowed(fields.category);
      const grants = newGrants(given);
      checkCount(await entriesOf(characterId));
      const gain = gainOptions(options);
      const entry = { ...fields, id: backend.newId("entry", characterId), characterId } as ItemEntry;
      if (grants.length > 0) entry.grants = grants;
      await write([{ op: "set-entry", value: entry }, acquired(entry, entry.quantity, gain).change]);
      return entry;
    },

    async updateEntry(entryId, patch, options = {}) {
      const stored = await storedEntry(entryId);
      const entry = plainEntry(stored);
      if (entry.category === "skills") {
        throw new ValidationError("category", `${entryName(entry)} is a skill; only its notes can change.`);
      }
      if (patch.category !== undefined && patch.category !== entry.category) {
        throw new ValidationError("category", "An entry's category can't change.");
      }
      // Grants are added and removed one at a time (addGrant, removeGrant); an edit keeps them.
      if (patch.grants !== undefined && !sameGrants(patch.grants, entry.grants)) {
        throw new ValidationError("grants", "Add or remove grants one at a time, not by editing the entry.");
      }
      const { id: _id, characterId: _c, ...current } = entry;
      // A field left undefined is unchanged; empty text, or null for a number, clears an optional one.
      const merged: Record<string, unknown> = { ...current };
      for (const [key, value] of Object.entries(patch)) if (value !== undefined) merged[key] = value;
      merged.category = entry.category;
      const fields = check.itemEntry(merged, ref, entry as unknown as Record<string, unknown>);
      const next = { ...fields, id: entry.id, characterId: entry.characterId } as ItemEntry;
      if (entry.grants !== undefined) next.grants = entry.grants;
      const gained = next.quantity - entry.quantity;
      const edited = changedFields(entry, next, ["id", "characterId", "quantity"]);
      const changes: Change[] = [];
      // Quantities are added to, not set, so changes made on two phones add up (NF-3).
      if (gained !== 0) changes.push({ op: "add-quantity", entryId, by: gained });
      // Where it came from is checked, and kept, only with a gain (IN-11).
      if (gained > 0) changes.push(acquired(next, gained, gainOptions(options)).change);
      // An ally made inactive by an edit stops granting, as with setActive (GR-3, EQ-8).
      const deactivated = entry.category === "allies" && entry.active && next.category === "allies" && !next.active;
      // EQ-4: an edit to what an equipped entry fits unequips it.
      // The stored slot, not equippedAt: a slot left that no longer fits is cleared too (its
      // grants already didn't count, so losingFrom keeps no cause for it).
      const refitted = stored.slot !== undefined && PLACEMENT.some((f) => f in edited);
      await writeLosing(
        [...update("entry", entryId, refitted ? { ...edited, slot: undefined } : edited), ...changes],
        "unequipped",
        deactivated || refitted ? losingFrom(stored) : [],
      );
      return next;
    },

    entry: ownEntry,

    async entryWithSlot(characterId, entryId) {
      // An entry that isn't the user's, or isn't in the inventory, is no entry of this character's.
      // So is one the phone can't read without signal because it has never kept it (NF-3): the
      // backend's offline error, which only this read treats as "not here", as the sheet would.
      const missing = (error: unknown) => {
        if (error instanceof NotFoundError || error instanceof AccessDeniedError) return undefined;
        if ((error as { code?: unknown } | null)?.code === "unavailable") return undefined;
        throw error;
      };
      const [character, entry] = await Promise.all([ownCharacter(characterId), storedEntry(entryId).catch(missing)]);
      if (entry?.characterId !== characterId) return { character, entry: null };
      return { character, entry: plainEntry(entry), slot: equippedAt(entry) };
    },

    async listEntries(characterId, category, filter = {}) {
      await ownCharacter(characterId);
      // IN-9: equipped, or active for an ally; SE-3 can filter on it.
      const items: EntryListItem[] = (await storedEntriesOf(characterId))
        .filter((e) => e.category === category && matchesFilter(e, filter))
        .map((e) => ({
          entry: plainEntry(e),
          equipped: e.category === "allies" ? e.active : equippedAt(e) !== undefined,
        }))
        .filter((item) => filter.equipped === undefined || item.equipped === filter.equipped);
      return items.sort((a, b) => entryName(a.entry).localeCompare(entryName(b.entry)));
    },

    async markUsed(entryId, options = {}) {
      const entry = await ownEntry(entryId);
      if (entry.category !== "consumables" && entry.category !== "components") {
        throw new ValidationError(
          "category",
          `${entryName(entry)} can't be marked used: only consumables and components can.`,
        );
      }
      const { date, note } = check.eventOptions(options, now());
      const left = entry.quantity - 1;
      const used = record(entry.characterId, {
        event: "used",
        date,
        ...aboutEntry(entry),
        quantity: 1,
        note,
        snapshot: left === 0 ? snapshot(entry, entry.quantity) : undefined,
        summary: `Used 1 × ${entry.name}`,
      });
      await write([used.change, { op: "add-quantity", entryId, by: -1 }]);
      return used.record;
    },

    async restoreUsed(historyId, options = {}) {
      uid();
      const stored = mine(await backend.historyRecord(historyId), "history record", historyId, "That isn't yours.");
      const used = stored.record;
      if (used.event !== "used")
        throw new ValidationError("event", `Only a used record can be restored, not ${used.event}.`);
      if ((await backend.history(used.characterId)).some((h) => h.record.restores === historyId)) {
        throw new ValidationError("event", `That use of ${used.entryName} was restored already.`);
      }
      const entry = used.entryId === undefined ? undefined : await backend.entry(used.entryId);
      if (entry === undefined || entry === "not-mine") {
        throw new ValidationError("entryId", `${used.entryName} is no longer in the inventory.`);
      }
      // NF-6: a restore can't take the quantity, or the character's entries, past their maximums.
      if (entry.quantity <= 0) checkCount(await entriesOf(entry.characterId));
      if (Math.max(entry.quantity, 0) + 1 > check.LIMITS.quantity) {
        throw new ValidationError("quantity", `${used.entryName} is already at the most a quantity can be.`);
      }
      // Dated with the use it undoes, so the two sit together in the history (IN-13).
      const { date, note } = check.eventOptions({ ...options, date: options.date ?? used.date }, now());
      const restored = record(entry.characterId, {
        event: "restored",
        date,
        ...aboutEntry(entry),
        quantity: 1,
        restores: historyId,
        note,
        summary: `Restored 1 × ${entryName(entry)}`,
      });
      // NF-3: below 0 (two offline phones each used the last one), it comes back with 1.
      const by = entry.quantity < 0 ? 1 - entry.quantity : 1;
      await write([{ op: "add-quantity", entryId: entry.id, by }, restored.change]);
      return restored.record;
    },

    async markTraded(entryId, options) {
      const stored = await storedEntry(entryId);
      const entry = plainEntry(stored);
      if (entry.category === "skills") {
        throw new ValidationError("category", `${entryName(entry)} is a skill and can't be traded or given away.`);
      }
      const kind = options.kind;
      if (kind !== "traded" && kind !== "given-away") {
        throw new ValidationError("kind", "An entry is either traded or given away.");
      }
      const quantity =
        options.quantity === undefined
          ? entry.quantity
          : check.wholeNumber("quantity", options.quantity, 1, entry.quantity);
      const { date, note } = check.eventOptions(options, now());
      const traded = record(entry.characterId, {
        event: kind,
        date,
        ...aboutEntry(entry),
        quantity,
        note,
        snapshot: snapshot(entry, quantity),
        summary: `${kind === "traded" ? "Traded" : "Gave away"} ${quantity} × ${entry.name}`,
      });
      // At zero it leaves the inventory, but stays so a mistaken "used" can still be restored (IN-13).
      // An equipped entry is unequipped, and an active ally made inactive, before it's traded or
      // given away (IN-14); its grants stop counting at once (GR-5), which may raise an alert (EQ-8).
      await writeLosing(
        [
          traded.change,
          { op: "add-quantity", entryId, by: -quantity },
          ...(entry.category === "allies" && entry.active ? update("entry", entryId, { active: false }) : []),
          ...(stored.slot !== undefined ? update("entry", entryId, { slot: undefined }) : []),
        ],
        kind,
        losingFrom(stored),
      );
      return traded.record;
    },

    async deleteEntry(entryId) {
      // As stored, so Undo brings it back where it was equipped (IN-15).
      const entry = await storedEntry(entryId);
      const records = (await backend.history(entry.characterId)).filter((h) => h.record.entryId === entryId);
      const causes = await writeLosing(
        [
          { op: "delete", kind: "entry", id: entryId },
          ...records.map((h): Change => ({ op: "delete", kind: "history", id: h.record.id })),
        ],
        "deleted",
        losingFrom(entry),
      );
      const deletedAt = clock.now().getTime();
      let undone = false;
      return {
        async undo() {
          if (undone) throw new ValidationError("undo", `${entryName(entry)} was brought back already.`);
          if (clock.now().getTime() - deletedAt > UNDO_SECONDS * 1000) {
            throw new ValidationError("undo", `It's too late to undo deleting ${entryName(entry)}.`);
          }
          // NF-6: Undo can't take the character past its entries, and the entry comes back where it
          // was equipped only if that's still allowed (EQ-2, EQ-7); otherwise unequipped.
          const sheet = await sheetFor(entry.characterId);
          checkCount(sheet.entries);
          const { slot, ...unequipped } = entry;
          const back: StoredEntry = { ...unequipped } as StoredEntry;
          if (slot !== undefined) {
            const withIt = { ...sheet, entries: [...sheet.entries, plainEntry(back)] };
            if (checkEquip(withIt, ref, entry.id, slot).outcome === "allowed") back.slot = slot;
          }
          await write([
            { op: "set-entry", value: back },
            ...records.map((h): Change => ({ op: "set-history", value: h })),
          ]);
          // The deletion no longer explains an alert: the entry is back.
          causes.forEach(forget);
          undone = true;
        },
      };
    },

    async suggestions(field) {
      const characters = await myCharacters();
      let typed: unknown[];
      let common: { name: string; retired?: boolean }[];
      if (field === "acquisitionSource") {
        const history = (await Promise.all(characters.map((c) => backend.history(c.id)))).flat();
        typed = history.map((h) => h.record.source);
        common = ref.acquisitionSources;
      } else {
        const entries = (await Promise.all(characters.map((c) => entriesOf(c.id)))).flat();
        const key = field === "componentTier" ? "tier" : field;
        typed = entries.map((e) => (e as unknown as Record<string, unknown>)[key]);
        common = field === "itemFamily" ? ref.itemFamilies : field === "componentTier" ? ref.componentTiers : [];
      }
      const values = [...typed, ...common.filter((s) => !s.retired).map((s) => s.name)];
      const seen = new Map<string, string>();
      for (const value of values) {
        if (typeof value === "string" && !seen.has(value.toLowerCase())) seen.set(value.toLowerCase(), value);
      }
      return [...seen.values()].sort((a, b) => a.localeCompare(b));
    },

    // ---------------------------------------------------------------- skills (SK)
    async skillPicker(characterId, options) {
      return pickSkills(await sheetFor(characterId), ref, options);
    },

    async addSkill(characterId, input) {
      const sheet = await sheetFor(characterId);
      const skill = ref.skills.find((s) => s.id === input.skillId);
      if (!skill) throw new NotFoundError("skill", input.skillId);
      if (skillRetired(skill, ref)) {
        throw new ValidationError("skillId", `${skill.name} has been retired and can't be added.`);
      }
      const entry: SkillEntry = {
        id: backend.newId("entry", characterId),
        characterId,
        category: "skills",
        skillId: skill.id,
        howGained: check.howGained(input.howGained),
        levelGained: check.level(input.levelGained, ref, "levelGained"),
        quantity: 1,
      };
      const notes = check.optionalText("notes", input.notes, check.LIMITS.notes);
      if (notes !== undefined) entry.notes = notes;
      checkCount(sheet.entries);
      const warnings = skillWarnings(sheet, ref, skill.id);
      const gain = { date: now(), note: undefined, source: undefined, link: undefined };
      await write([{ op: "set-entry", value: entry }, acquired(entry, 1, gain).change]);
      return { entry, warnings };
    },

    async skills(characterId) {
      await ownCharacter(characterId);
      return (await entriesOf(characterId))
        .filter((e): e is SkillEntry => e.category === "skills")
        .map(skillView)
        .sort(byName);
    },

    skillReplacements: later("skillReplacements", "M5"),
    acceptReplacement: later("acceptReplacement", "M5"),

    // ---------------------------------------------------------------- grants and equipping (GR, EQ)
    async addGrant(target, input) {
      const source = await grantSource(target);
      if (source.kind === "entry") check.grantsAllowed(source.entry.category);
      const grants = oneMore(sourceGrants(source), input);
      await write(update(source.kind, sourceId(source), { grants }));
      return grants.at(-1)!;
    },

    async addManualGrant(characterId, reason, input) {
      const character = await storedCharacter(characterId);
      const manual = character.manualGrants ?? [];
      check.atMost(manual.length + 1, check.LIMITS.manualGrants, "manualGrants", "A character", "manual grants");
      const grants = newGrants(input);
      if (grants.length === 0) throw new ValidationError("grants", "A manual grant needs at least one grant.");
      const added: ManualGrant = {
        id: backend.newId("grant"),
        reason: check.requiredText("reason", reason, check.LIMITS.shortText),
        grants,
      };
      await write(update("character", characterId, { manualGrants: [...manual, added] }));
      return added;
    },

    async removeGrant(grantId) {
      const without = (grants: Grant[] = []) => grants.filter((g) => g.id !== grantId);
      const find = (grants: Grant[] = []) => grants.find((g) => g.id === grantId);
      const title = (await myTitles()).find((t) => find(t.grants));
      if (title) return removeFrom({ kind: "title", title }, grantId);
      const characters = await storedCharacters();
      for (const character of characters) {
        const manual = character.manualGrants ?? [];
        const grant = manual.map((m) => find(m.grants)).find((g) => g !== undefined);
        if (!grant) continue;
        // A manual grant left with nothing in it goes too.
        const kept = manual.map((m) => ({ ...m, grants: without(m.grants) })).filter((m) => m.grants.length > 0);
        const losing = losesSlots([grant]) ? [character.id] : [];
        return void (await writeLosing(
          update("character", character.id, { manualGrants: kept }),
          "grant-removed",
          losing,
        ));
      }
      // Only then the entries, which take the most reading. A skill's grants are the skill
      // list's (SK-7), so they can't be removed here.
      const entries = (await Promise.all(characters.map((c) => storedEntriesOf(c.id)))).flat();
      const entry = entries.find((e) => find(ownGrants(e)));
      if (!entry) throw new NotFoundError("grant", grantId);
      return removeFrom({ kind: "entry", entry }, grantId);
    },

    // NF-5: the grant is looked for only on its entry or title. Removing one that gives a slot
    // also reads the sheets it can take that slot from, as every removal does (EQ-8).
    removeGrantFrom: async (target, grantId) => removeFrom(await grantSource(target), grantId),

    async removeManualGrant(characterId, manualGrantId) {
      const character = await storedCharacter(characterId);
      const manual = character.manualGrants ?? [];
      const removed = manual.find((m) => m.id === manualGrantId);
      if (!removed) throw new NotFoundError("manual grant", manualGrantId);
      await writeLosing(
        update("character", characterId, { manualGrants: manual.filter((m) => m !== removed) }),
        "grant-removed",
        losesSlots(removed.grants) ? [characterId] : [],
      );
    },

    async equip(entryId, target) {
      const entry = await ownEntry(entryId);
      return (await equipOnSheet(await sheetFor(entry.characterId), entryId, [target]))[0]!;
    },

    // checkEquip refuses an entry that isn't on this character's sheet.
    equipFirst: async (characterId, entryId, targets) => equipOnSheet(await sheetFor(characterId), entryId, targets),

    async unequip(entryId) {
      const entry = await storedEntry(entryId);
      if (entry.slot === undefined) return;
      await writeLosing(update("entry", entryId, { slot: undefined }), "unequipped", losingFrom(entry));
    },

    async setActive(entryId, active) {
      const entry = await ownEntry(entryId);
      if (entry.category !== "allies") {
        throw new ValidationError("category", `${entryName(entry)} isn't a familiar or ally, so it can't be active.`);
      }
      if (typeof active !== "boolean") throw new ValidationError("active", "Active is either on or off.");
      if (entry.active === active) return;
      // An ally made inactive stops granting (GR-3), like an unequipped entry.
      await writeLosing(update("entry", entryId, { active }), "unequipped", active ? [] : losingFrom(entry));
    },

    async totals(characterId) {
      return computeTotals(await sheetFor(characterId), ref);
    },

    alerts: async (characterId) => (await sheetWithAlerts(characterId)).alerts,
    sheetWithAlerts,
    sheet: (characterId) => sheetFor(characterId),

    async lastChange(characterId) {
      await ownCharacter(characterId);
      return lastChanges.get(characterId);
    },

    // ---------------------------------------------------------------- history (HI)
    async history(characterId, filter = {}) {
      await ownCharacter(characterId);
      const events = filter.events?.length ? new Set(filter.events) : undefined;
      const categories = filter.categories?.length ? new Set(filter.categories) : undefined;
      return (await backend.history(characterId))
        .filter((h) => !events || events.has(h.record.event))
        .filter((h) => !categories || (h.record.category !== undefined && categories.has(h.record.category)))
        .sort(newestFirst)
        .map((h) => h.record);
    },

    // ---------------------------------------------------------------- search and export (SE, EX)
    async search(query, options) {
      return (await store.searcher(options))(query);
    },

    async searcher(options) {
      let characters: Character[];
      if (options.allCharacters === true) {
        // SE-2: every character, retired ones included.
        characters = await myCharacters();
      } else if (options.characterId !== undefined) {
        characters = [await ownCharacter(options.characterId)];
      } else {
        throw new ValidationError("characterId", "Search one character, or all of them.");
      }
      const searchable = await withEntries(characters);
      return (query) => searchEntries(query, searchable, ref, settings.showSkillText);
    },

    async printableSheet(options) {
      return printable(options);
    },

    async printablePdf(options) {
      return renderPdf(await printable(options), options);
    },

    async exportJson() {
      const profile = await ownProfile();
      const [characters, titles] = await Promise.all([storedCharacters(), myTitles()]);
      const file: ExportFile = {
        formatVersion: EXPORT_FORMAT_VERSION,
        exportedAt: now(),
        profile: { displayName: profile.displayName },
        characters: await Promise.all(
          characters.sort(byName).map(async (stored) => {
            const [entries, history] = await Promise.all([storedEntriesOf(stored.id), backend.history(stored.id)]);
            const sheet = sheetOf(stored, entries, titles);
            return {
              character: sheet.character,
              entries: sheet.entries.sort((a, b) => entryName(a).localeCompare(entryName(b))),
              equipped: sheet.equipped,
              manualGrants: sheet.manualGrants,
              history: history.sort(newestFirst).map((h) => h.record),
            };
          }),
        ),
        titles: titles.sort(byName),
        todo: [],
      };
      return file;
    },

    // ---------------------------------------------------------------- reports (SP)
    async sendReport(input) {
      const me = uid();
      if (!REPORT_KINDS.includes(input.kind)) {
        throw new ValidationError("kind", `A report is one of: ${REPORT_KINDS.join(", ")}.`);
      }
      const subject = check.requiredText("subject", input.subject, check.LIMITS.reportSubject);
      const message = check.requiredText("message", input.message, check.LIMITS.reportMessage);
      if (input.characterId !== undefined) await ownCharacter(input.characterId);
      const sentAt = now();
      const today = (await backend.reports()).filter((r) => r.sentAt.slice(0, 10) === sentAt.slice(0, 10));
      if (today.length >= REPORTS_PER_DAY) {
        throw new RateLimitError(REPORTS_PER_DAY, `You can send ${REPORTS_PER_DAY} reports a day. Try again tomorrow.`);
      }
      const report: Report = tidy<Report>({
        id: backend.newId("report"),
        number: backend.reportNumber(),
        uid: me,
        kind: input.kind,
        subject,
        message,
        characterId: input.characterId,
        sentAt,
        appVersion: settings.appVersion,
        delivery: "pending",
      });
      await write([{ op: "set-report", value: report }]);
      return report;
    },

    async reports() {
      uid();
      return (await backend.reports()).sort((a, b) => a.sentAt.localeCompare(b.sentAt) || a.number - b.number);
    },

    // ---------------------------------------------------------------- offline (NF-3)
    async syncStatus() {
      uid();
      return backend.syncStatus();
    },
  };

  /** EX-1: one character, or every one that isn't retired. */
  async function printable(options: PrintOptions) {
    let characters: StoredCharacter[];
    if (options.characterIds === "all") {
      characters = (await storedCharacters()).filter((c) => c.retired !== true).sort(byName);
    } else {
      characters = await Promise.all(options.characterIds.map(storedCharacter));
    }
    const [titles, entries] = await Promise.all([
      myTitles(),
      Promise.all(characters.map((c) => storedEntriesOf(c.id))),
    ]);
    const pages = characters
      .map((stored, i) => sheetOf(stored, entries[i]!, titles))
      .map((sheet) => ({
        character: sheet.character,
        entries: sheet.entries,
        titles: sheet.titles,
        totals: computeTotals(sheet, ref),
        slots: slotState(sheet, ref),
      }));
    return buildSheet(pages, ref, {
      createdAt: now(),
      includeSkillText: options.includeSkillText === true,
      showSkillText: settings.showSkillText,
    });
  }

  return store;
}
