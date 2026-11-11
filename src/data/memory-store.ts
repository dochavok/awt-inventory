// The in-memory data layer (TF-2): one MemoryDatabase holds every user's data,
// and createMemoryStore() gives the store for whoever is signed in, so tests
// can check one user is refused another's records (PV-1).
//
// Methods for later milestones throw NotImplementedError naming the milestone.

import { AccessDeniedError, ConfirmationError, NotFoundError, NotImplementedError, ValidationError } from "../errors";
import { toStoredTime } from "../platform/time";
import { skillPicker as pickSkills, skillWarnings } from "../rules/skills";
import type { Character, ClassName, Entry, Id, ItemEntry, SkillEntry, Title, TitleScope } from "../rules/types";
import { later as laterIn, requireUid, type InventoryStore, type StoreContext } from "./store";
import type { EntryListItem, EntrySnapshot, GainOptions, HistoryRecord, Profile, SkillView } from "./types";
import * as check from "./validate";

interface Owned<T> {
  uid: string;
  value: T;
}

/** A history record, with its place in the order records were made (HI-1). */
interface StoredRecord {
  seq: number;
  record: HistoryRecord;
}

/** Every user's data, shared by the stores created over it. */
export class MemoryDatabase {
  readonly profiles = new Map<string, Profile>();
  readonly characters = new Map<Id, Owned<Character>>();
  /**
   * Entries, including ones used up or traded away, kept at quantity 0 so a
   * restore can bring them back (IN-13). At 0 they're out of the inventory:
   * not listed, and reading one says it's not found.
   */
  readonly entries = new Map<Id, Entry>();
  readonly history = new Map<Id, StoredRecord>();
  readonly titles = new Map<Id, Owned<Title>>();
  private counter = 0;

  newId(prefix: string): Id {
    this.counter += 1;
    return `${prefix}${this.counter}`;
  }

  nextSeq(): number {
    this.counter += 1;
    return this.counter;
  }
}

/** IN-15: how long Undo works after a hard delete. */
const UNDO_SECONDS = 10;

const copy = <T>(value: T): T => structuredClone(value);

function notYet(what: string, milestone: string): never {
  throw new NotImplementedError(`MemoryStore.${what}`, milestone);
}

const later = (what: string, milestone: string) => laterIn(`MemoryStore.${what}`, milestone);

export function createMemoryStore(db: MemoryDatabase, context: StoreContext): InventoryStore {
  const { clock, ref, settings } = context;
  const now = () => toStoredTime(clock.now());

  // ---------------------------------------------------------------- access (PV-1)

  const uid = () => requireUid(context);

  function ownProfile(): Profile {
    const me = uid();
    const profile = db.profiles.get(me);
    if (!profile) throw new NotFoundError("profile", me);
    return profile;
  }

  function ownCharacter(characterId: Id): Character {
    const me = uid();
    const found = db.characters.get(characterId);
    if (!found) throw new NotFoundError("character", characterId);
    if (found.uid !== me) throw new AccessDeniedError("That character isn't yours.");
    return found.value;
  }

  function ownEntry(entryId: Id): Entry {
    uid();
    const entry = db.entries.get(entryId);
    if (!entry) throw new NotFoundError("entry", entryId);
    ownCharacter(entry.characterId);
    if (entry.quantity === 0) throw new NotFoundError("entry", entryId);
    return entry;
  }

  function ownTitle(titleId: Id): Title {
    const me = uid();
    const found = db.titles.get(titleId);
    if (!found) throw new NotFoundError("title", titleId);
    if (found.uid !== me) throw new AccessDeniedError("That title isn't yours.");
    return found.value;
  }

  function myCharacters(): Character[] {
    const me = uid();
    return [...db.characters.values()].filter((c) => c.uid === me).map((c) => c.value);
  }

  function myTitles(): Title[] {
    const me = uid();
    return [...db.titles.values()].filter((t) => t.uid === me).map((t) => t.value);
  }

  /** A character's entries still in the inventory (quantity above 0). */
  const entriesOf = (characterId: Id) =>
    [...db.entries.values()].filter((e) => e.characterId === characterId && e.quantity > 0);
  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);

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

  function record(characterId: Id, fields: Omit<HistoryRecord, "id" | "characterId" | "enteredAt">): HistoryRecord {
    const r: HistoryRecord = { id: db.newId("h"), characterId, enteredAt: now(), ...fields };
    for (const key of Object.keys(r) as (keyof HistoryRecord)[]) if (r[key] === undefined) delete r[key];
    db.history.set(r.id, { seq: db.nextSeq(), record: r });
    return copy(r);
  }

  function aboutEntry(entry: Entry) {
    return { entryId: entry.id, entryName: entryName(entry), category: entry.category };
  }

  /** A gain's date and note, checked before anything is stored (HI-3). */
  function gainOptions(options: GainOptions): { date: string; note: string | undefined } {
    if (options.source !== undefined || options.link !== undefined) notYet("acquisition sources (IN-11)", "M3");
    return check.eventOptions(options, now());
  }

  function acquired(entry: Entry, quantity: number, gain: { date: string; note: string | undefined }) {
    return record(entry.characterId, {
      event: "acquired",
      ...gain,
      ...aboutEntry(entry),
      quantity,
      summary: `Acquired ${quantity} × ${entryName(entry)}`,
    });
  }

  // ---------------------------------------------------------------- characters (CH)

  function uniqueName(name: string, except?: Id): void {
    const clash = myCharacters().find((c) => c.id !== except && c.name.toLowerCase() === name.toLowerCase());
    if (clash) throw new ValidationError("name", `You already have a character called ${clash.name}.`);
  }

  function checkCount(characterId: Id): void {
    if (entriesOf(characterId).length >= check.LIMITS.entriesPerCharacter) {
      throw new ValidationError(
        "entries",
        `A character can have at most ${check.LIMITS.entriesPerCharacter.toLocaleString("en-US")} entries.`,
      );
    }
  }

  function noGrants(grants: unknown): void {
    if (Array.isArray(grants) && grants.length > 0) notYet("grants (GR-2)", "M4");
  }

  function correctionMessage(from: ClassName, to: ClassName): string {
    return (
      `A class can't change in the game, so only correct it if ${from} was a mistake when the character was created. ` +
      `Changing it to ${to} changes the class bonus, combat dice, hearts and arcane slots, ` +
      `and which skills are in the character's own trees.`
    );
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

  function sheetOf(character: Character) {
    return {
      character: copy(character),
      entries: copy(entriesOf(character.id)),
      equipped: [],
      titles: copy(titlesApplying(character.id)),
      manualGrants: [],
    };
  }

  // ---------------------------------------------------------------- titles (TI)

  function titlesApplying(characterId: Id): Title[] {
    return myTitles()
      .filter((t) => t.scope.level === "player" || t.scope.characterId === characterId)
      .sort(byName);
  }

  function checkScope(scope: TitleScope | undefined): TitleScope {
    if (scope === undefined || scope.level === "player") return { level: "player" };
    if (scope.level !== "character") throw new ValidationError("scope", "A title is player-level or character-level.");
    ownCharacter(scope.characterId);
    return { level: "character", characterId: scope.characterId };
  }

  function removeCharacterData(characterId: Id): void {
    for (const [id, entry] of db.entries) if (entry.characterId === characterId) db.entries.delete(id);
    for (const [id, { record: r }] of db.history) if (r.characterId === characterId) db.history.delete(id);
    for (const [id, t] of db.titles) {
      if (t.value.scope.level === "character" && t.value.scope.characterId === characterId) db.titles.delete(id);
    }
    db.characters.delete(characterId);
  }

  const store: InventoryStore = {
    // ---------------------------------------------------------------- account (AC, PV)
    async createProfile(input) {
      const profile: Profile = {
        uid: uid(),
        displayName: check.displayName(input.displayName),
        email: check.email(input.email),
      };
      db.profiles.set(profile.uid, profile);
      return copy(profile);
    },

    async profile() {
      return copy(ownProfile());
    },

    async setDisplayName(name) {
      const profile = ownProfile();
      profile.displayName = check.displayName(name);
      return copy(profile);
    },

    async deleteAccount(typed) {
      const profile = ownProfile();
      const me = profile.uid;
      if (typed.trim() !== profile.displayName) {
        throw new ConfirmationError(profile.displayName, `Type your display name, ${profile.displayName}, to confirm.`);
      }
      for (const character of myCharacters()) removeCharacterData(character.id);
      for (const [id, t] of db.titles) if (t.uid === me) db.titles.delete(id);
      db.profiles.delete(me);
    },

    // ---------------------------------------------------------------- characters (CH)
    async createCharacter(input) {
      const me = uid();
      const name = check.requiredText("name", input.name, check.LIMITS.name);
      const character: Character = {
        id: db.newId("c"),
        name,
        className: check.className(input.className),
        level: check.level(input.level, ref),
      };
      const notes = check.optionalText("notes", input.notes, check.LIMITS.notes);
      if (notes !== undefined) character.notes = notes;
      uniqueName(name);
      db.characters.set(character.id, { uid: me, value: character });
      return copy(character);
    },

    async updateCharacter(characterId, patch, options = {}) {
      const character = ownCharacter(characterId);
      const next = { ...character };
      if (patch.name !== undefined) {
        next.name = check.requiredText("name", patch.name, check.LIMITS.name);
        uniqueName(next.name, characterId);
      }
      if (patch.level !== undefined) next.level = check.level(patch.level, ref);
      if (patch.notes !== undefined) {
        const notes = check.optionalText("notes", patch.notes, check.LIMITS.notes);
        if (notes === undefined) delete next.notes;
        else next.notes = notes;
      }
      const { date, note } = check.eventOptions(options, now());
      if (next.level !== character.level) {
        record(characterId, {
          event: "level-changed",
          date,
          change: { from: character.level, to: next.level },
          note,
          summary: `Level ${character.level} → ${next.level}`,
        });
      }
      db.characters.get(characterId)!.value = next;
      return copy(next);
    },

    async classCorrectionNotice(characterId, to) {
      const character = ownCharacter(characterId);
      return {
        from: character.className,
        to: check.className(to),
        message: correctionMessage(character.className, to),
        affects: ["class bonus", "combat dice", "hearts", "arcane slots", "own skill trees"],
      };
    },

    async correctClass(characterId, to, options) {
      const character = ownCharacter(characterId);
      const className = check.className(to);
      if (className === character.className) {
        throw new ValidationError("className", `${character.name} is already a ${className}.`);
      }
      if (options.confirmed !== true) {
        throw new ConfirmationError("confirmed", correctionMessage(character.className, className));
      }
      record(characterId, {
        event: "class-corrected",
        date: now(),
        change: { from: character.className, to: className },
        summary: `Class corrected: ${character.className} → ${className}`,
      });
      const next = { ...character, className };
      db.characters.get(characterId)!.value = next;
      return copy(next);
    },

    async retireCharacter(characterId) {
      ownCharacter(characterId);
      db.characters.get(characterId)!.value.retired = true;
    },

    async restoreCharacter(characterId) {
      ownCharacter(characterId);
      delete db.characters.get(characterId)!.value.retired;
    },

    async deleteCharacter(characterId, typedName) {
      const character = ownCharacter(characterId);
      if (typedName.trim() !== character.name) {
        throw new ConfirmationError(character.name, `Type the character's name, ${character.name}, to confirm.`);
      }
      removeCharacterData(characterId);
    },

    async listCharacters(list) {
      const retired = list === "retired";
      return copy(
        myCharacters()
          .filter((c) => (c.retired === true) === retired)
          .sort(byName),
      );
    },

    async character(characterId) {
      return copy(ownCharacter(characterId));
    },

    // ---------------------------------------------------------------- titles (TI)
    async addTitle(input) {
      const me = uid();
      noGrants(input.grants);
      const title: Title = {
        id: db.newId("t"),
        name: check.requiredText("name", input.name, check.LIMITS.name),
        scope: checkScope(input.scope),
      };
      const description = check.optionalText("description", input.description, check.LIMITS.description);
      if (description !== undefined) title.description = description;
      const earned = check.calendarDate("earned", input.earned);
      if (earned !== undefined) title.earned = earned;
      db.titles.set(title.id, { uid: me, value: title });
      return copy(title);
    },

    async updateTitle(titleId, patch) {
      const title = { ...ownTitle(titleId) };
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
      db.titles.get(titleId)!.value = title;
      return copy(title);
    },

    async setTitleScope(titleId, scope) {
      ownTitle(titleId);
      const checked = checkScope(scope);
      const stored = db.titles.get(titleId)!.value;
      stored.scope = checked;
      return copy(stored);
    },

    async removeTitle(titleId) {
      ownTitle(titleId);
      db.titles.delete(titleId);
    },

    async listTitles() {
      return copy(myTitles().sort(byName));
    },

    async titlesFor(characterId) {
      ownCharacter(characterId);
      return copy(titlesApplying(characterId));
    },

    async charactersFor(titleId) {
      const title = ownTitle(titleId);
      const scope = title.scope;
      const characters =
        scope.level === "player" ? myCharacters() : myCharacters().filter((c) => c.id === scope.characterId);
      return copy(characters.sort(byName));
    },

    // ---------------------------------------------------------------- entries (IN)
    async addEntry(characterId, input, options = {}) {
      ownCharacter(characterId);
      noGrants((input as { grants?: unknown }).grants);
      const fields = check.itemEntry(input as unknown as Record<string, unknown>, ref);
      checkCount(characterId);
      const gain = gainOptions(options);
      const entry = { ...fields, id: db.newId("e"), characterId } as ItemEntry;
      db.entries.set(entry.id, entry);
      acquired(entry, entry.quantity, gain);
      return copy(entry);
    },

    async updateEntry(entryId, patch, options = {}) {
      const entry = ownEntry(entryId);
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
      db.entries.set(entryId, next);
      if (gained > 0) acquired(next, gained, gain);
      return copy(next);
    },

    async entry(entryId) {
      return copy(ownEntry(entryId));
    },

    async listEntries(characterId, category, filter) {
      ownCharacter(characterId);
      if (filter && Object.values(filter).some((v) => v !== undefined)) {
        const equipped = filter.equipped !== undefined;
        notYet(equipped ? "listEntries equipped filter (SE-3)" : "listEntries filters (SE-3)", equipped ? "M4" : "M3");
      }
      const items: EntryListItem[] = entriesOf(characterId)
        .filter((e) => e.category === category)
        .map((entry) => ({ entry: copy(entry), equipped: entry.category === "allies" && entry.active }));
      return items.sort((a, b) => entryName(a.entry).localeCompare(entryName(b.entry)));
    },

    async markUsed(entryId, options = {}) {
      const entry = ownEntry(entryId);
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
      entry.quantity = left;
      return used;
    },

    async restoreUsed(historyId, options = {}) {
      const me = uid();
      const stored = db.history.get(historyId);
      if (!stored) throw new NotFoundError("history record", historyId);
      if (db.characters.get(stored.record.characterId)?.uid !== me) throw new AccessDeniedError("That isn't yours.");
      const used = stored.record;
      if (used.event !== "used")
        throw new ValidationError("event", `Only a used record can be restored, not ${used.event}.`);
      if ([...db.history.values()].some((h) => h.record.restores === historyId)) {
        throw new ValidationError("event", `That use of ${used.entryName} was restored already.`);
      }
      const entry = used.entryId === undefined ? undefined : db.entries.get(used.entryId);
      if (!entry) throw new ValidationError("entryId", `${used.entryName} is no longer in the inventory.`);
      const { date, note } = check.eventOptions(options, now());
      entry.quantity += 1;
      return record(entry.characterId, {
        event: "restored",
        date,
        ...aboutEntry(entry),
        quantity: 1,
        restores: historyId,
        note,
        summary: `Restored 1 × ${entryName(entry)}`,
      });
    },

    async markTraded(entryId, options) {
      const entry = ownEntry(entryId);
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
      // An ally traded away is no longer active (IN-14).
      entry.quantity -= quantity;
      if (entry.quantity === 0 && entry.category === "allies") entry.active = false;
      return traded;
    },

    async deleteEntry(entryId) {
      const entry = ownEntry(entryId);
      const records = [...db.history.entries()].filter(([, h]) => h.record.entryId === entryId);
      db.entries.delete(entryId);
      for (const [id] of records) db.history.delete(id);
      const deletedAt = clock.now().getTime();
      let undone = false;
      return {
        async undo() {
          if (undone) throw new ValidationError("undo", `${entryName(entry)} was brought back already.`);
          if (clock.now().getTime() - deletedAt > UNDO_SECONDS * 1000) {
            throw new ValidationError("undo", `It's too late to undo deleting ${entryName(entry)}.`);
          }
          ownCharacter(entry.characterId);
          db.entries.set(entryId, entry);
          for (const [id, h] of records) db.history.set(id, h);
          undone = true;
        },
      };
    },

    async suggestions(field) {
      if (field === "acquisitionSource") notYet("suggestions for acquisition sources (IN-11)", "M3");
      const mineIds = new Set(myCharacters().map((c) => c.id));
      const mine = [...db.entries.values()].filter((e) => mineIds.has(e.characterId) && e.quantity > 0);
      const typed = mine.map(
        (e) => (e as unknown as Record<string, unknown>)[field === "componentTier" ? "tier" : field],
      );
      const common = field === "itemFamily" ? ref.itemFamilies : field === "componentTier" ? ref.componentTiers : [];
      const values = [...typed, ...common.filter((s) => !s.retired).map((s) => s.name)];
      const seen = new Map<string, string>();
      for (const value of values) {
        if (typeof value === "string" && !seen.has(value.toLowerCase())) seen.set(value.toLowerCase(), value);
      }
      return [...seen.values()].sort((a, b) => a.localeCompare(b));
    },

    // ---------------------------------------------------------------- skills (SK)
    async skillPicker(characterId, options) {
      return pickSkills(sheetOf(ownCharacter(characterId)), ref, options);
    },

    async addSkill(characterId, input) {
      const character = ownCharacter(characterId);
      const skill = ref.skills.find((s) => s.id === input.skillId);
      if (!skill) throw new NotFoundError("skill", input.skillId);
      const tree = ref.trees.find((t) => t.id === skill.tree);
      if (skill.retired || tree?.retired) {
        throw new ValidationError("skillId", `${skill.name} has been retired and can't be added.`);
      }
      const entry: SkillEntry = {
        id: db.newId("e"),
        characterId,
        category: "skills",
        skillId: skill.id,
        howGained: check.howGained(input.howGained),
        levelGained: check.level(input.levelGained, ref, "levelGained"),
        quantity: 1,
      };
      const notes = check.optionalText("notes", input.notes, check.LIMITS.notes);
      if (notes !== undefined) entry.notes = notes;
      checkCount(characterId);
      const warnings = skillWarnings(sheetOf(character), ref, skill.id);
      db.entries.set(entry.id, entry);
      acquired(entry, 1, { date: now(), note: undefined });
      return { entry: copy(entry), warnings };
    },

    async skills(characterId) {
      ownCharacter(characterId);
      return entriesOf(characterId)
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
      const entry = ownEntry(entryId);
      if (entry.category !== "allies") {
        throw new ValidationError("category", `${entryName(entry)} isn't a familiar or ally, so it can't be active.`);
      }
      if (typeof active !== "boolean") throw new ValidationError("active", "Active is either on or off.");
      entry.active = active;
    },

    totals: later("totals", "M4"),
    alerts: later("alerts", "M4"),

    async sheet(characterId) {
      return sheetOf(ownCharacter(characterId));
    },

    lastChange: later("lastChange", "M4"),

    // ---------------------------------------------------------------- history (HI)
    async history(characterId, filter) {
      ownCharacter(characterId);
      if (filter && (filter.events?.length || filter.categories?.length)) notYet("history filters (HI-5)", "M3");
      return [...db.history.values()]
        .filter((h) => h.record.characterId === characterId)
        .sort((a, b) => b.record.date.localeCompare(a.record.date) || b.seq - a.seq)
        .map((h) => copy(h.record));
    },

    // ---------------------------------------------------------------- search, export, reports (M3)
    search: later("search", "M3"),
    printableSheet: later("printableSheet", "M3"),
    printablePdf: later("printablePdf", "M3"),
    exportJson: later("exportJson", "M3"),

    async sendReport(input) {
      uid();
      // NF-6 applies from M2; sending itself is SP-1 (M3).
      check.requiredText("subject", input.subject, check.LIMITS.reportSubject);
      check.requiredText("message", input.message, check.LIMITS.reportMessage);
      return notYet("sendReport", "M3");
    },

    reports: later("reports", "M3"),
    syncStatus: later("syncStatus", "M3"),
  };
  return store;
}
