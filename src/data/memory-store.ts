// The in-memory data layer (TF-2): one MemoryDatabase holds every user's data,
// and createMemoryStore() gives the store for whoever is signed in, so tests
// can check one user is refused another's records (PV-1). The logic is the
// shared one in records.ts; this file only keeps the records.

import type { Character, Entry, Id, Title } from "../rules/types";
import type { Backend, Change, StoredRecord } from "./backend";
import { createRecordsStore } from "./records";
import { requireUid, type InventoryStore, type StoreContext } from "./store";
import type { Profile, Report } from "./types";

interface Owned<T> {
  uid: string;
  value: T;
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
  readonly reports = new Map<Id, Report>();
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

const copy = <T>(value: T): T => structuredClone(value);

const PREFIX = { character: "c", entry: "e", history: "h", title: "t", report: "r" } as const;

function memoryBackend(db: MemoryDatabase, context: Pick<StoreContext, "currentUid">): Backend {
  const uid = () => requireUid(context);
  const ownerOf = (characterId: Id) => db.characters.get(characterId)?.uid;

  /** The user's own copy of something, "not-mine" for someone else's, or undefined. */
  function owned<T>(found: T | undefined, owner: string | undefined) {
    if (found === undefined) return undefined;
    return owner === uid() ? copy(found) : ("not-mine" as const);
  }

  function apply(change: Change): void {
    const me = uid();
    switch (change.op) {
      case "set-character":
        db.characters.set(change.value.id, { uid: me, value: copy(change.value) });
        return;
      case "set-entry":
        db.entries.set(change.value.id, copy(change.value));
        return;
      case "set-history":
        db.history.set(change.value.record.id, copy(change.value));
        return;
      case "set-title":
        db.titles.set(change.value.id, { uid: me, value: copy(change.value) });
        return;
      case "set-report":
        db.reports.set(change.value.id, copy(change.value));
        return;
      case "update": {
        const target =
          change.kind === "character"
            ? db.characters.get(change.id)?.value
            : change.kind === "title"
              ? db.titles.get(change.id)?.value
              : db.entries.get(change.id);
        if (!target) return;
        const fields = target as unknown as Record<string, unknown>;
        for (const [key, value] of Object.entries(change.fields)) {
          if (value === undefined) delete fields[key];
          else fields[key] = copy(value);
        }
        return;
      }
      case "add-quantity": {
        const entry = db.entries.get(change.entryId);
        if (entry) entry.quantity += change.by;
        return;
      }
      case "delete": {
        const maps = {
          character: db.characters,
          entry: db.entries,
          history: db.history,
          title: db.titles,
          report: db.reports,
        };
        maps[change.kind].delete(change.id);
        return;
      }
    }
  }

  return {
    newId: (kind) => db.newId(PREFIX[kind]),
    nextSeq: () => db.nextSeq(),
    reportNumber: () => db.nextSeq(),

    async profile() {
      const profile = db.profiles.get(uid());
      return profile && copy(profile);
    },
    async createProfile(profile) {
      db.profiles.set(profile.uid, copy(profile));
    },
    async setDisplayName(displayName) {
      const profile = db.profiles.get(uid());
      if (profile) profile.displayName = displayName;
    },
    async deleteAccount() {
      const me = uid();
      for (const [id, c] of db.characters) {
        if (c.uid !== me) continue;
        for (const [entryId, e] of db.entries) if (e.characterId === id) db.entries.delete(entryId);
        for (const [hid, h] of db.history) if (h.record.characterId === id) db.history.delete(hid);
        db.characters.delete(id);
      }
      for (const [id, t] of db.titles) if (t.uid === me) db.titles.delete(id);
      for (const [id, r] of db.reports) if (r.uid === me) db.reports.delete(id);
      db.profiles.delete(me);
    },

    async characters() {
      const me = uid();
      return [...db.characters.values()].filter((c) => c.uid === me).map((c) => copy(c.value));
    },
    async character(id) {
      const found = db.characters.get(id);
      return owned(found?.value, found?.uid);
    },
    async entries(characterId) {
      if (ownerOf(characterId) !== uid()) return [];
      return [...db.entries.values()].filter((e) => e.characterId === characterId).map(copy);
    },
    async entry(id) {
      const found = db.entries.get(id);
      return owned(found, found && ownerOf(found.characterId));
    },
    async history(characterId) {
      if (ownerOf(characterId) !== uid()) return [];
      return [...db.history.values()].filter((h) => h.record.characterId === characterId).map(copy);
    },
    async historyRecord(id) {
      const found = db.history.get(id);
      return owned(found, found && ownerOf(found.record.characterId));
    },
    async titles() {
      const me = uid();
      return [...db.titles.values()].filter((t) => t.uid === me).map((t) => copy(t.value));
    },
    async title(id) {
      const found = db.titles.get(id);
      return owned(found?.value, found?.uid);
    },
    async reports() {
      const me = uid();
      return [...db.reports.values()].filter((r) => r.uid === me).map(copy);
    },

    async write(changes) {
      for (const change of changes) apply(change);
    },
    async syncStatus() {
      return { online: true, pendingChanges: 0 };
    },
  };
}

export function createMemoryStore(db: MemoryDatabase, context: StoreContext): InventoryStore {
  return createRecordsStore(memoryBackend(db, context), context, "MemoryStore");
}
