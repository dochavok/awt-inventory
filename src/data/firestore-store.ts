// The data layer on Cloud Firestore (TF-2), with the layout fixed by
// tests/access/privacy.test.ts:
//   users/{uid}                                   profile: display name and email (PV-2)
//   users/{uid}/titles/{titleId}
//   users/{uid}/characters/{characterId}
//   users/{uid}/characters/{characterId}/entries/{entryId}
//   users/{uid}/characters/{characterId}/history/{recordId}
//   users/{uid}/reports/{reportId}
//   users/{uid}/characterNames/name-{name}        which character has a name (NF-3, CH-1)
// firestore.rules enforces who may read and change what (PV-1, NF-13).
//
// The logic is the shared one in records.ts. Working offline (NF-3):
// - changes are saved to the phone's offline cache straight away and sent when
//   there's signal, so nothing waits for the server except creating a profile;
// - quantities are added to, never set, so changes on two phones add up;
// - each changed field records when it was changed (`edited`), and the rules
//   refuse an older change that arrives after a newer one, so the later change
//   wins whichever phone syncs last.
// An entry's or history record's ID starts with its character's ID
// ("{characterId}~{id}"), so it can be found from the ID alone.

import {
  collection,
  deleteField,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  getDocsFromCache,
  getDocsFromServer,
  increment,
  onSnapshot,
  query,
  setDoc,
  where,
  writeBatch,
  type DocumentData,
  type DocumentReference,
  type DocumentSnapshot,
  type Firestore,
  type WriteBatch,
} from "firebase/firestore";
import { AccessDeniedError } from "../errors";
import type { Character, Entry, Id, Title } from "../rules/types";
import type { Backend, Change, RecordKind, StoredRecord } from "./backend";
import { createRecordsStore } from "./records";
import { requireUid, type InventoryStore, type StoreContext } from "./store";
import { characterNameKey } from "./validate";
import type { HistoryRecord, Report } from "./types";

/** Firestore's limit on writes in one batch. */
const BATCH_LIMIT = 500;

/** How long a check for signal waits before saying there's none. */
const PROBE_MS = 3_000;

const SEP = "~";

/** What a refused change was about, for telling the user (NF-3). */
export interface RefusedChange {
  kind: RecordKind | "profile";
  /** The record's ID, where the change has one. */
  id?: Id;
  /** The record's name, where the change knows it: e.g. the character "Wren", or a rename's new name. */
  name?: string;
}

export interface FirestoreStoreOptions {
  /**
   * Called when the server refuses a change the phone had already saved (for
   * example one made offline that the rules refuse once it's sent). The change
   * is undone on the phone; the app tells the user.
   */
  onWriteRefused?: (error: unknown, change: RefusedChange) => void;
}

function isPermissionDenied(error: unknown): boolean {
  const code = (error as { code?: unknown }).code;
  return code === "permission-denied" || code === "PERMISSION_DENIED";
}

/** A record's data as stored: no ID fields, nothing undefined. */
function stored(value: object, omit: string[]): DocumentData {
  return Object.fromEntries(Object.entries(value).filter(([k, v]) => v !== undefined && !omit.includes(k)));
}

/** A record as the app sees it: the stored data, without the edit times. */
function fields(snap: DocumentSnapshot): DocumentData {
  const { edited: _edited, ...data } = snap.data() ?? {};
  return data;
}

const characterOf = (id: Id): Id | undefined => (id.includes(SEP) ? id.split(SEP)[0] : undefined);

/** Where a user's records live (the layout above). */
function accountRefs(db: Firestore, uid: string) {
  const user = doc(db, "users", uid);
  return {
    user,
    characters: collection(user, "characters"),
    titles: collection(user, "titles"),
    reports: collection(user, "reports"),
    /** Claims on names, one per name ignoring case; the "name-" prefix keeps every ID valid. */
    names: collection(user, "characterNames"),
  };
}

/**
 * `firestore` is a Firestore instance for the signed-in user: the app's, or in
 * tests one from the emulator (the modular functions accept either API's).
 */
export function createFirestoreStore(
  firestore: unknown,
  context: StoreContext,
  options: FirestoreStoreOptions = {},
): InventoryStore {
  const db = firestore as Firestore;
  const uid = () => requireUid(context);
  const user = (): DocumentReference => accountRefs(db, uid()).user;
  const characters = () => accountRefs(db, uid()).characters;
  const characterRef = (id: Id) => doc(characters(), id);
  const entries = (characterId: Id) => collection(characterRef(characterId), "entries");
  const historyOf = (characterId: Id) => collection(characterRef(characterId), "history");
  const titles = () => accountRefs(db, uid()).titles;
  const reports = () => accountRefs(db, uid()).reports;
  const names = () => accountRefs(db, uid()).names;

  /** The document a record lives in, or undefined for an ID no record of that kind can have. */
  function refFor(kind: RecordKind, id: Id): DocumentReference | undefined {
    switch (kind) {
      case "character":
        return characterRef(id);
      case "title":
        return doc(titles(), id);
      case "report":
        return doc(reports(), id);
      case "entry":
      case "history": {
        const characterId = characterOf(id);
        if (characterId === undefined) return undefined;
        return doc(kind === "entry" ? entries(characterId) : historyOf(characterId), id);
      }
    }
  }

  async function read(kind: RecordKind, id: Id): Promise<DocumentSnapshot | undefined> {
    const ref = refFor(kind, id);
    if (!ref) return undefined;
    const snap = await getDoc(ref);
    return snap.exists() ? snap : undefined;
  }

  const toCharacter = (snap: DocumentSnapshot) => ({ ...fields(snap), id: snap.id }) as Character;
  const toEntry = (snap: DocumentSnapshot) =>
    ({ ...fields(snap), id: snap.id, characterId: characterOf(snap.id) ?? snap.ref.parent.parent!.id }) as Entry;
  const toTitle = (snap: DocumentSnapshot) => ({ ...fields(snap), id: snap.id }) as Title;
  const toRecord = (snap: DocumentSnapshot): StoredRecord => {
    const { seq, ...data } = fields(snap);
    const characterId = snap.ref.parent.parent!.id;
    return { seq: typeof seq === "number" ? seq : 0, record: { ...data, id: snap.id, characterId } as HistoryRecord };
  };
  const toReport = (snap: DocumentSnapshot) => ({ ...fields(snap), id: snap.id, uid: uid() }) as Report;

  // ---------------------------------------------------------------- writes and sync (NF-3)

  let pending = 0;
  let lastSeq = 0;

  /** One batched write, and what it's about, to tell the user if the server refuses it. */
  interface Sent {
    batch: WriteBatch;
    /**
     * Absent for tidying the user didn't ask for (a deleted character's name claims):
     * a refusal of that isn't news to them.
     */
    about?: RefusedChange;
  }

  /**
   * Sends one change (one user action), whatever number of batches it takes.
   * Not awaited: the change is on the phone already, and is sent whenever there's signal.
   */
  function send(batches: Sent[]): void {
    if (batches.length === 0) return;
    pending += 1;
    const refused = (about: RefusedChange) => (error: unknown) => {
      try {
        options.onWriteRefused?.(error, about);
      } catch (handlerError) {
        console.error("The write-refused handler failed", handlerError);
      }
    };
    const commits = batches.map(({ batch, about }) => batch.commit().catch(about ? refused(about) : () => undefined));
    void Promise.all(commits).then(() => {
      pending -= 1;
    });
  }

  /** What a change (or one field of an update) is about: its kind of record, its ID and, where it has one, its name. */
  function aboutChange(change: Change, field?: string): RefusedChange {
    switch (change.op) {
      case "set-character":
        return { kind: "character", id: change.value.id, name: change.value.name };
      case "set-title":
        return { kind: "title", id: change.value.id, name: change.value.name };
      case "set-entry": {
        const about: RefusedChange = { kind: "entry", id: change.value.id };
        if ("name" in change.value) about.name = change.value.name;
        return about;
      }
      case "set-history":
        return { kind: "history", id: change.value.record.id };
      case "set-report":
        return { kind: "report", id: change.value.id };
      case "add-quantity":
        return { kind: "entry", id: change.entryId };
      case "update": {
        const about: RefusedChange = { kind: change.kind, id: change.id };
        const value = field === undefined ? undefined : change.fields[field];
        if (field === "name" && typeof value === "string") about.name = value;
        return about;
      }
      case "delete":
        return { kind: change.kind, id: change.id };
    }
  }

  /**
   * The batched writes for a list of changes: field edits each on their own, the rest together.
   * A character's name is claimed in the same batch as the character, or as its new name, so
   * the server refuses both together when another character has the name (NF-3, CH-1).
   */
  function batchesFor(changes: Change[]): Sent[] {
    const out: Sent[] = [];
    let current: Sent | undefined;
    let size = 0;
    const plain = (change: Change, writes: number): WriteBatch => {
      if (current === undefined || size + writes > BATCH_LIMIT) {
        current = { batch: writeBatch(db), about: aboutChange(change) };
        size = 0;
        out.push(current);
      }
      size += writes;
      return current.batch;
    };
    for (const change of changes) {
      if (change.op === "update") {
        // Each field on its own: if the rules refuse one as older than a change already on the
        // server, only that field's change is lost, never another field's or anything else.
        const ref = refFor(change.kind, change.id);
        if (!ref) continue;
        const at = Date.parse(change.at);
        for (const [key, value] of Object.entries(change.fields)) {
          const own = writeBatch(db);
          own.update(ref, { [key]: value === undefined ? deleteField() : value, [`edited.${key}`]: at });
          if (change.kind === "character" && key === "name" && typeof value === "string") {
            claimName(own, value, change.id);
          }
          out.push({ batch: own, about: aboutChange(change, key) });
        }
        current = undefined;
        continue;
      }
      // A record whose ID names no stored document has nothing to delete.
      if (change.op === "delete" && !refFor(change.kind, change.id)) continue;
      const b = plain(change, change.op === "set-character" ? 2 : 1);
      switch (change.op) {
        case "set-character":
          b.set(characterRef(change.value.id), stored(change.value, ["id"]));
          claimName(b, change.value.name, change.value.id);
          break;
        case "set-entry":
          b.set(refFor("entry", change.value.id)!, stored(change.value, ["id", "characterId"]));
          break;
        case "set-history":
          b.set(refFor("history", change.value.record.id)!, {
            ...stored(change.value.record, ["id", "characterId"]),
            seq: change.value.seq,
          });
          break;
        case "set-title":
          b.set(doc(titles(), change.value.id), stored(change.value, ["id"]));
          break;
        case "set-report":
          b.set(doc(reports(), change.value.id), stored(change.value, ["id", "uid"]));
          break;
        case "add-quantity":
          b.update(refFor("entry", change.entryId)!, { quantity: increment(change.by) });
          break;
        case "delete":
          b.delete(refFor(change.kind, change.id)!);
          break;
      }
    }
    return out;
  }

  /**
   * Claims a name for a character, with the name as the character has it. Every rename
   * claims again, a change of case too. A rename never releases the old name's claim (only
   * deleting the character does, claimDeletes): the rules let a claim be taken over once its
   * character is gone or has another name, so a claim left behind (on any phone, offline
   * too) never blocks.
   */
  function claimName(batch: WriteBatch, name: string, characterId: Id): void {
    batch.set(doc(names(), `name-${encodeURIComponent(characterNameKey(name))}`), { characterId, name });
  }

  /**
   * Deletes for the claims that still point to characters being deleted (CH-6), current
   * and past names. With signal they're read from the server, so a claim another phone has
   * taken over is left alone; without, from what the phone has (the whole-account load puts
   * every claim on it, and its own changes are there too). Each is its own batch, sent after
   * the character's, so a failed claim delete never undoes the character's.
   */
  async function claimDeletes(deleted: Set<Id>): Promise<Sent[]> {
    const fromCache = () => getDocsFromCache(names());
    const read = listening?.online ? getDocsFromServer(names()).catch(fromCache) : fromCache();
    const claims = await read.then(
      (snap) => snap.docs.filter((d) => deleted.has(d.get("characterId") as string)),
      () => [],
    );
    return claims.map((claim) => {
      const batch = writeBatch(db);
      batch.delete(claim.ref);
      return { batch };
    });
  }

  // Whether the phone has signal, from a listener on the profile that Firestore keeps up to date.
  let listening: { uid: string; online: boolean; stop: () => void } | undefined;
  function watch(): void {
    const me = uid();
    if (listening?.uid === me) return;
    listening?.stop();
    const state = { uid: me, online: false, stop: () => {} };
    state.stop = onSnapshot(
      user(),
      { includeMetadataChanges: true },
      (snap) => {
        state.online = !snap.metadata.fromCache;
      },
      () => {
        // A listener that fails stops for good: forget it, so the next check starts a new one
        // instead of asking the server directly every time.
        state.online = false;
        if (listening === state) listening = undefined;
      },
    );
    listening = state;
  }

  async function online(): Promise<boolean> {
    watch();
    if (listening?.online) return true;
    // The listener may not have caught up yet: ask the server directly, briefly.
    const probe = getDocFromServer(user()).then(
      () => true,
      () => false,
    );
    const timeout = new Promise<boolean>((resolve) => setTimeout(() => resolve(false), PROBE_MS));
    return Promise.race([probe, timeout]);
  }

  // ---------------------------------------------------------------- the backend

  const backend: Backend = {
    newId(kind, characterId) {
      const id = doc(collection(db, "ids")).id;
      if (kind === "entry" || kind === "history") return `${characterId}${SEP}${id}`;
      return id;
    },
    nextSeq() {
      // From the clock, so phones roughly agree, and always above the last one made here (HI-1).
      lastSeq = Math.max(lastSeq + 1, context.clock.now().getTime() * 1000);
      return lastSeq;
    },
    reportNumber() {
      // Made on the phone, so a report written offline has its number straight away.
      return 10_000_000 + Math.floor(Math.random() * 90_000_000);
    },

    async profile() {
      const me = uid();
      const snap = await getDoc(user());
      if (!snap.exists()) return undefined;
      const data = snap.data() as { displayName: string; email?: string };
      return { uid: me, displayName: data.displayName, email: data.email ?? "" };
    },

    async createProfile(profile) {
      try {
        await setDoc(user(), { displayName: profile.displayName, email: profile.email });
      } catch (error) {
        // The rules refuse a profile the user may not create, such as one for an email that isn't invited (NF-13).
        if (isPermissionDenied(error)) throw new AccessDeniedError("The server refused to create the profile.");
        throw error;
      }
    },

    async setDisplayName(displayName) {
      const batch = writeBatch(db);
      batch.update(user(), { displayName });
      // With signal, wait for the server, so the account screen can show a refusal (AC-2).
      // Without, don't wait: it's sent when signal returns, like every other change (NF-3).
      if (!(await online())) return send([{ batch, about: { kind: "profile", name: displayName } }]);
      try {
        await batch.commit();
      } catch (error) {
        if (isPermissionDenied(error)) throw new AccessDeniedError("The server refused the new display name.");
        throw error;
      }
    },

    async deleteAccount() {
      const me = user();
      const [characterDocs, titleDocs, reportDocs, nameDocs] = await Promise.all([
        getDocs(characters()),
        getDocs(titles()),
        getDocs(reports()),
        getDocs(names()),
      ]);
      // Each character goes last, so until it's gone a retry can find what's left in it. Entries
      // go first; then their history records (HI-4: allowed once their entry is gone); then the
      // character with the records about no entry (level changes), which may go only with it.
      const perCharacter = await Promise.all(
        characterDocs.docs.map(async (character) => {
          const [entryDocs, history] = await Promise.all([
            getDocs(collection(character.ref, "entries")),
            getDocs(collection(character.ref, "history")),
          ]);
          const aboutEntry = history.docs.filter((d) => typeof d.get("entryId") === "string");
          const aboutCharacter = history.docs.filter((d) => typeof d.get("entryId") !== "string");
          return [
            ...entryDocs.docs.map((d) => [d.ref]),
            ...aboutEntry.map((d) => [d.ref]),
            [character.ref, ...aboutCharacter.map((d) => d.ref)],
          ];
        }),
      );
      // Listings for trade show the display name to everyone, so they go too (AC-5).
      const listings = await getDocs(query(collection(db, "listings"), where("ownerUid", "==", me.id)));
      await deleteInOrder([
        ...perCharacter.flat(),
        ...titleDocs.docs.map((d) => [d.ref]),
        ...reportDocs.docs.map((d) => [d.ref]),
        ...nameDocs.docs.map((d) => [d.ref]),
        ...listings.docs.map((d) => [d.ref]),
        [me],
      ]);
    },

    async characters() {
      return (await getDocs(characters())).docs.map(toCharacter);
    },
    async character(id) {
      const snap = await read("character", id);
      return snap && toCharacter(snap);
    },
    async entries(characterId) {
      return (await getDocs(entries(characterId))).docs.map(toEntry);
    },
    async entry(id) {
      const snap = await read("entry", id);
      return snap && toEntry(snap);
    },
    async history(characterId) {
      return (await getDocs(historyOf(characterId))).docs.map(toRecord);
    },
    async historyRecord(id) {
      const snap = await read("history", id);
      return snap && toRecord(snap);
    },
    async titles() {
      return (await getDocs(titles())).docs.map(toTitle);
    },
    async title(id) {
      const snap = await read("title", id);
      return snap && toTitle(snap);
    },
    async reports() {
      return (await getDocs(reports())).docs.map(toReport);
    },

    async write(changes) {
      uid();
      watch();
      const deleted = new Set(changes.flatMap((c) => (c.op === "delete" && c.kind === "character" ? [c.id] : [])));
      // Only a character's deletion waits to find its claims; every other change is sent straight away.
      const claims = deleted.size > 0 ? await claimDeletes(deleted) : [];
      send([...batchesFor(changes), ...claims]);
    },

    async syncStatus() {
      const isOnline = await online();
      // Let writes the server has just answered settle before counting what's still waiting.
      await new Promise((resolve) => setTimeout(resolve, 0));
      return { online: isOnline, pendingChanges: pending };
    },
  };

  /**
   * Deletes groups of documents in order, packed into batches; a group is kept
   * in one batch where it fits. If a batch fails, a retry finds whatever is left.
   * A group too big for one batch is split, its first document first: for a
   * character, that's the character itself, after which its other records may go.
   */
  async function deleteInOrder(groups: DocumentReference[][]): Promise<void> {
    let batch = writeBatch(db);
    let size = 0;
    const flush = async () => {
      if (size > 0) await batch.commit();
      batch = writeBatch(db);
      size = 0;
    };
    for (const group of groups) {
      if (size + group.length > BATCH_LIMIT) await flush();
      for (const ref of group) {
        if (size === BATCH_LIMIT) await flush();
        batch.delete(ref);
        size += 1;
      }
    }
    await flush();
  }

  return createRecordsStore(backend, context, "FirestoreStore");
}

/**
 * NF-3: with signal, reads everything in the account once, so the phone's offline
 * cache holds every character, including ones this phone never opened, and the
 * claims on their names.
 */
export async function loadWholeAccount(firestore: unknown, uid: string): Promise<void> {
  // From the server only: without a real connection this fails, rather than counting what the
  // phone already had as read.
  const refs = accountRefs(firestore as Firestore, uid);
  const [, characterDocs] = await Promise.all([
    getDocFromServer(refs.user),
    getDocsFromServer(refs.characters),
    getDocsFromServer(refs.titles),
    getDocsFromServer(refs.reports),
    getDocsFromServer(refs.names),
  ]);
  await Promise.all(
    characterDocs.docs.flatMap((character) => [
      getDocsFromServer(collection(character.ref, "entries")),
      getDocsFromServer(collection(character.ref, "history")),
    ]),
  );
}
