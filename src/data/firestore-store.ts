// The data layer on Cloud Firestore (TF-2), with the layout fixed by
// tests/access/privacy.test.ts:
//   users/{uid}                                   profile: display name and email (PV-2)
//   users/{uid}/titles/{titleId}
//   users/{uid}/characters/{characterId}
//   users/{uid}/characters/{characterId}/entries/{entryId}
//   users/{uid}/characters/{characterId}/history/{recordId}
//   users/{uid}/reports/{reportId}
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
import type { HistoryRecord, Report } from "./types";

/** Firestore's limit on writes in one batch. */
const BATCH_LIMIT = 500;

/** How long a check for signal waits before saying there's none. */
const PROBE_MS = 3_000;

const SEP = "~";

export interface FirestoreStoreOptions {
  /**
   * Called when the server refuses a change the phone had already saved (for
   * example one made offline that the rules refuse once it's sent). The change
   * is undone on the phone; the app tells the user.
   */
  onWriteRefused?: (error: unknown) => void;
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
  const user = (): DocumentReference => doc(db, "users", uid());
  const characters = () => collection(user(), "characters");
  const characterRef = (id: Id) => doc(characters(), id);
  const entries = (characterId: Id) => collection(characterRef(characterId), "entries");
  const historyOf = (characterId: Id) => collection(characterRef(characterId), "history");
  const titles = () => collection(user(), "titles");
  const reports = () => collection(user(), "reports");

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

  /**
   * Sends one change (one user action), whatever number of batches it takes.
   * Not awaited: the change is on the phone already, and is sent whenever there's signal.
   */
  function send(batches: WriteBatch[]): void {
    if (batches.length === 0) return;
    pending += 1;
    const refused = (error: unknown) => {
      try {
        options.onWriteRefused?.(error);
      } catch (handlerError) {
        console.error("The write-refused handler failed", handlerError);
      }
    };
    void Promise.all(batches.map((batch) => batch.commit().catch(refused))).then(() => {
      pending -= 1;
    });
  }

  /** The batched writes for a list of changes: field edits each on their own, the rest together. */
  function batchesFor(changes: Change[]): WriteBatch[] {
    const out: WriteBatch[] = [];
    let batch: WriteBatch | undefined;
    let size = 0;
    const next = () => {
      batch = writeBatch(db);
      size = 0;
      out.push(batch);
      return batch;
    };
    const plain = () => (batch === undefined || size === BATCH_LIMIT ? next() : batch);
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
          out.push(own);
        }
        batch = undefined;
        continue;
      }
      // A record whose ID names no stored document has nothing to delete.
      if (change.op === "delete" && !refFor(change.kind, change.id)) continue;
      const b = plain();
      size += 1;
      switch (change.op) {
        case "set-character":
          b.set(characterRef(change.value.id), stored(change.value, ["id"]));
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
        state.online = false;
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
      if (!(await online())) return send([batch]);
      try {
        await batch.commit();
      } catch (error) {
        if (isPermissionDenied(error)) throw new AccessDeniedError("The server refused the new display name.");
        throw error;
      }
    },

    async deleteAccount() {
      const me = user();
      const [characterDocs, titleDocs, reportDocs] = await Promise.all([
        getDocs(characters()),
        getDocs(titles()),
        getDocs(reports()),
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
      send(batchesFor(changes));
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
