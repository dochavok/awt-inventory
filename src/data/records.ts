// The data layer's logic (TF-2), shared by every store: what each action
// checks, reads and changes. Where the records live is the backend's job
// (backend.ts): the in-memory database in tests, Firestore in the app.
//
// Methods for later milestones throw NotImplementedError naming the milestone.

import {
  AccessDeniedError,
  ConfirmationError,
  NotFoundError,
  NotImplementedError,
  RateLimitError,
  ValidationError,
} from "../errors";
import { toStoredTime } from "../platform/time";
import { skillPicker as pickSkills, skillWarnings } from "../rules/skills";
import type {
  CharacterSheet,
  Character,
  ClassName,
  Entry,
  Id,
  ItemEntry,
  SkillEntry,
  Title,
  TitleScope,
} from "../rules/types";
import type { Backend, Change, NotMine, StoredRecord } from "./backend";
import { searchEntries } from "./search";
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
  ReportKind,
  SkillView,
} from "./types";
import * as check from "./validate";

/** IN-15: how long Undo works after a hard delete. */
const UNDO_SECONDS = 10;

/** SP-1: reports a user can send in a day. */
const REPORTS_PER_DAY = 5;

/** EX-4: the JSON export's format version. */
const EXPORT_FORMAT_VERSION = 1;

const REPORT_KINDS: readonly ReportKind[] = ["missing-skill", "bug", "idea", "account-problem"];

function notYet(what: string, milestone: string): never {
  throw NotImplementedError.stub(what, milestone);
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

  async function ownCharacter(characterId: Id): Promise<Character> {
    uid();
    return mine(await backend.character(characterId), "character", characterId, "That character isn't yours.");
  }

  async function ownEntry(entryId: Id): Promise<Entry> {
    uid();
    const entry = mine(await backend.entry(entryId), "entry", entryId, "That character isn't yours.");
    if (entry.quantity <= 0) throw new NotFoundError("entry", entryId);
    return entry;
  }

  async function ownTitle(titleId: Id): Promise<Title> {
    uid();
    return mine(await backend.title(titleId), "title", titleId, "That title isn't yours.");
  }

  async function myCharacters(): Promise<Character[]> {
    uid();
    return backend.characters();
  }

  async function myTitles(): Promise<Title[]> {
    uid();
    return backend.titles();
  }

  /** A character's entries still in the inventory (quantity above 0). */
  const entriesOf = async (characterId: Id) => (await backend.entries(characterId)).filter((e) => e.quantity > 0);

  const write = (changes: Change[]) => backend.write(changes);

  // ---------------------------------------------------------------- names and history

  function skillName(skillId: Id): string {
    return ref.skills.find((s) => s.id === skillId)?.name ?? skillId;
  }

  function entryName(entry: Entry): string {
    return entry.category === "skills" ? skillName(entry.skillId) : entry.name;
  }

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
    const clash = (await myCharacters()).find((c) => c.id !== except && c.name.toLowerCase() === name.toLowerCase());
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

  function noGrants(grants: unknown): void {
    if (Array.isArray(grants) && grants.length > 0) notYet(`${label} grants (GR-2)`, "M4");
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
    const tree = ref.trees.find((t) => t.id === skill?.tree);
    const view: SkillView = {
      entryId: entry.id,
      skillId: entry.skillId,
      name: skill?.name ?? entry.skillId,
      tree: tree?.name ?? skill?.tree ?? "",
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

  async function sheetOf(character: Character): Promise<CharacterSheet> {
    const [entries, titles] = await Promise.all([entriesOf(character.id), myTitles()]);
    return { character, entries, equipped: [], titles: applying(titles, character.id), manualGrants: [] };
  }

  // ---------------------------------------------------------------- titles (TI)

  /** The titles that apply to a character: player-level ones and its own, by name. */
  function applying(titles: Title[], characterId: Id): Title[] {
    return titles.filter((t) => t.scope.level === "player" || t.scope.characterId === characterId).sort(byName);
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
        await uniqueName(next.name, characterId);
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
      await write(changes);
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
      await write([corrected.change, ...update("character", characterId, { className })]);
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
      noGrants(input.grants);
      const title: Title = {
        id: backend.newId("title"),
        name: check.requiredText("name", input.name, check.LIMITS.name),
        scope: await checkScope(input.scope),
      };
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
      await write(update("title", titleId, { scope: checked }));
      return { ...title, scope: checked };
    },

    async removeTitle(titleId) {
      await ownTitle(titleId);
      await write([{ op: "delete", kind: "title", id: titleId }]);
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
      noGrants((input as { grants?: unknown }).grants);
      const fields = check.itemEntry(input as unknown as Record<string, unknown>, ref);
      checkCount(await entriesOf(characterId));
      const gain = gainOptions(options);
      const entry = { ...fields, id: backend.newId("entry", characterId), characterId } as ItemEntry;
      await write([{ op: "set-entry", value: entry }, acquired(entry, entry.quantity, gain).change]);
      return entry;
    },

    async updateEntry(entryId, patch, options = {}) {
      const entry = await ownEntry(entryId);
      if (entry.category === "skills") {
        throw new ValidationError("category", `${entryName(entry)} is a skill; only its notes can change.`);
      }
      if (patch.category !== undefined && patch.category !== entry.category) {
        throw new ValidationError("category", "An entry's category can't change.");
      }
      noGrants(patch.grants);
      const { id: _id, characterId: _c, ...current } = entry;
      // A field left undefined is unchanged; empty text clears an optional one.
      const merged: Record<string, unknown> = { ...current };
      for (const [key, value] of Object.entries(patch)) if (value !== undefined) merged[key] = value;
      merged.category = entry.category;
      const fields = check.itemEntry(merged, ref);
      const next = { ...fields, id: entry.id, characterId: entry.characterId } as ItemEntry;
      const gained = next.quantity - entry.quantity;
      const gain = gainOptions(options);
      const changes = update("entry", entryId, changedFields(entry, next, ["id", "characterId", "quantity"]));
      // Quantities are added to, not set, so changes made on two phones add up (NF-3).
      if (gained !== 0) changes.push({ op: "add-quantity", entryId, by: gained });
      if (gained > 0) changes.push(acquired(next, gained, gain).change);
      await write(changes);
      return next;
    },

    entry: ownEntry,

    async listEntries(characterId, category, filter = {}) {
      await ownCharacter(characterId);
      if (filter.equipped !== undefined) notYet(`${label}.listEntries equipped filter (SE-3)`, "M4");
      const rarity = filter.rarity;
      const family = filter.itemFamily?.toLowerCase();
      const items: EntryListItem[] = (await entriesOf(characterId))
        .filter((e) => e.category === category)
        .filter((e) => rarity === undefined || ("rarity" in e && e.rarity === rarity))
        .filter((e) => family === undefined || ("itemFamily" in e && e.itemFamily?.toLowerCase() === family))
        .map((entry) => ({ entry, equipped: entry.category === "allies" && entry.active }));
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
      const entry = await ownEntry(entryId);
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
      // An active ally is made inactive before it's traded or given away (IN-14).
      await write([
        traded.change,
        { op: "add-quantity", entryId, by: -quantity },
        ...(entry.category === "allies" && entry.active ? update("entry", entryId, { active: false }) : []),
      ]);
      return traded.record;
    },

    async deleteEntry(entryId) {
      const entry = await ownEntry(entryId);
      const records = (await backend.history(entry.characterId)).filter((h) => h.record.entryId === entryId);
      await write([
        { op: "delete", kind: "entry", id: entryId },
        ...records.map((h): Change => ({ op: "delete", kind: "history", id: h.record.id })),
      ]);
      const deletedAt = clock.now().getTime();
      let undone = false;
      return {
        async undo() {
          if (undone) throw new ValidationError("undo", `${entryName(entry)} was brought back already.`);
          if (clock.now().getTime() - deletedAt > UNDO_SECONDS * 1000) {
            throw new ValidationError("undo", `It's too late to undo deleting ${entryName(entry)}.`);
          }
          await ownCharacter(entry.characterId);
          await write([
            { op: "set-entry", value: entry },
            ...records.map((h): Change => ({ op: "set-history", value: h })),
          ]);
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
      return pickSkills(await sheetOf(await ownCharacter(characterId)), ref, options);
    },

    async addSkill(characterId, input) {
      const character = await ownCharacter(characterId);
      const skill = ref.skills.find((s) => s.id === input.skillId);
      if (!skill) throw new NotFoundError("skill", input.skillId);
      const tree = ref.trees.find((t) => t.id === skill.tree);
      if (skill.retired || tree?.retired) {
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
      const sheet = await sheetOf(character);
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

    // ---------------------------------------------------------------- grants and equipping (M4)
    addGrant: later("addGrant", "M4"),
    addManualGrant: later("addManualGrant", "M4"),
    removeGrant: later("removeGrant", "M4"),
    equip: later("equip", "M4"),
    unequip: later("unequip", "M4"),

    async setActive(entryId, active) {
      const entry = await ownEntry(entryId);
      if (entry.category !== "allies") {
        throw new ValidationError("category", `${entryName(entry)} isn't a familiar or ally, so it can't be active.`);
      }
      if (typeof active !== "boolean") throw new ValidationError("active", "Active is either on or off.");
      if (entry.active !== active) await write(update("entry", entryId, { active }));
    },

    totals: later("totals", "M4"),
    alerts: later("alerts", "M4"),

    async sheet(characterId) {
      return sheetOf(await ownCharacter(characterId));
    },

    lastChange: later("lastChange", "M4"),

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
      let characters: Character[];
      if (options.allCharacters === true) {
        // SE-2: every character, retired ones included.
        characters = await myCharacters();
      } else if (options.characterId !== undefined) {
        characters = [await ownCharacter(options.characterId)];
      } else {
        throw new ValidationError("characterId", "Search one character, or all of them.");
      }
      return searchEntries(query, await withEntries(characters), ref, settings.showSkillText);
    },

    async printableSheet(options) {
      return printable(options);
    },

    async printablePdf(options) {
      return renderPdf(await printable(options), options);
    },

    async exportJson() {
      const profile = await ownProfile();
      const characters = (await myCharacters()).sort(byName);
      const file: ExportFile = {
        formatVersion: EXPORT_FORMAT_VERSION,
        exportedAt: now(),
        profile: { displayName: profile.displayName },
        characters: await Promise.all(
          characters.map(async (character) => ({
            character,
            entries: (await entriesOf(character.id)).sort((a, b) => entryName(a).localeCompare(entryName(b))),
            equipped: [],
            manualGrants: [],
            history: (await backend.history(character.id)).sort(newestFirst).map((h) => h.record),
          })),
        ),
        titles: (await myTitles()).sort(byName),
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
    let characters: Character[];
    if (options.characterIds === "all") {
      characters = (await myCharacters()).filter((c) => c.retired !== true).sort(byName);
    } else {
      characters = await Promise.all(options.characterIds.map(ownCharacter));
    }
    const [titles, entries] = await Promise.all([myTitles(), Promise.all(characters.map((c) => entriesOf(c.id)))]);
    const pages = characters.map((character, i) => ({
      character,
      entries: entries[i]!,
      titles: applying(titles, character.id),
    }));
    return buildSheet(pages, ref, {
      createdAt: now(),
      includeSkillText: options.includeSkillText === true,
      showSkillText: settings.showSkillText,
    });
  }

  return store;
}
