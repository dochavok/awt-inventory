// The data layer on Cloud Firestore (TF-2), with the layout fixed by
// tests/access/privacy.test.ts:
//   users/{uid}                                   profile: display name and email (PV-2)
//   users/{uid}/titles/{titleId}
//   users/{uid}/characters/{characterId}
//   users/{uid}/characters/{characterId}/entries/{entryId}
//   users/{uid}/characters/{characterId}/history/{recordId}
// firestore.rules enforces who may read and change what (PV-1, NF-13).
//
// M2 implements the account (AC-2, AC-5, PV-2), which the sign-up and account
// screens use. The records themselves, with working offline (NF-3), are M3.

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  writeBatch,
  type DocumentReference,
  type Firestore,
} from "firebase/firestore";
import { AccessDeniedError, ConfirmationError, NotFoundError } from "../errors";
import { later as laterIn, requireUid, type InventoryStore, type StoreContext } from "./store";
import type { Profile } from "./types";
import * as check from "./validate";

/** Firestore's limit on writes in one batch. */
const BATCH_LIMIT = 500;

const later = (what: string, milestone = "M3") => laterIn(`FirestoreStore.${what}`, milestone);

function isPermissionDenied(error: unknown): boolean {
  const code = (error as { code?: unknown }).code;
  return code === "permission-denied" || code === "PERMISSION_DENIED";
}

/**
 * `firestore` is a Firestore instance for the signed-in user: the app's, or in
 * tests one from the emulator (the modular functions accept either API's).
 */
export function createFirestoreStore(firestore: unknown, context: StoreContext): InventoryStore {
  const db = firestore as Firestore;
  const uid = () => requireUid(context);
  const profileRef = (): DocumentReference => doc(db, "users", uid());

  async function readProfile(): Promise<Profile> {
    const me = uid();
    const snap = await getDoc(profileRef());
    if (!snap.exists()) throw new NotFoundError("profile", me);
    const data = snap.data() as { displayName: string; email?: string };
    return { uid: me, displayName: data.displayName, email: data.email ?? "" };
  }

  /**
   * Deletes groups of documents in order, packed into batches; a group is never
   * split between two batches. If a batch fails, a retry finds whatever is left.
   */
  async function deleteInOrder(groups: DocumentReference[][]): Promise<void> {
    let batch = writeBatch(db);
    let size = 0;
    for (const group of groups) {
      if (size > 0 && size + group.length > BATCH_LIMIT) {
        await batch.commit();
        batch = writeBatch(db);
        size = 0;
      }
      for (const ref of group) batch.delete(ref);
      size += group.length;
    }
    if (size > 0) await batch.commit();
  }

  return {
    // ---------------------------------------------------------------- account (AC, PV)
    async createProfile(input) {
      const profile: Profile = {
        uid: uid(),
        displayName: check.displayName(input.displayName),
        email: check.email(input.email),
      };
      try {
        await setDoc(profileRef(), { displayName: profile.displayName, email: profile.email });
      } catch (error) {
        // The rules refuse a profile the user may not create, such as one for an email that isn't invited (NF-13).
        if (isPermissionDenied(error)) throw new AccessDeniedError("The server refused to create the profile.");
        throw error;
      }
      return profile;
    },

    profile: readProfile,

    async setDisplayName(name) {
      const displayName = check.displayName(name);
      const profile = await readProfile();
      await updateDoc(profileRef(), { displayName });
      return { ...profile, displayName };
    },

    async deleteAccount(typed) {
      const profile = await readProfile();
      if (typed.trim() !== profile.displayName) {
        throw new ConfirmationError(profile.displayName, `Type your display name, ${profile.displayName}, to confirm.`);
      }
      const user = profileRef();
      const [characters, titles] = await Promise.all([
        getDocs(collection(user, "characters")),
        getDocs(collection(user, "titles")),
      ]);
      // Each character goes last, so until it's gone a retry can find what's left in it. Entries
      // go first; then their history records (HI-4: allowed once their entry is gone); then the
      // records about no entry (level changes), in the same batch as the character itself.
      const perCharacter = await Promise.all(
        characters.docs.map(async (character) => {
          const [entries, history] = await Promise.all([
            getDocs(collection(character.ref, "entries")),
            getDocs(collection(character.ref, "history")),
          ]);
          const aboutEntry = history.docs.filter((d) => typeof d.get("entryId") === "string");
          const aboutCharacter = history.docs.filter((d) => typeof d.get("entryId") !== "string");
          return [
            ...entries.docs.map((d) => [d.ref]),
            ...aboutEntry.map((d) => [d.ref]),
            [...aboutCharacter.map((d) => d.ref), character.ref],
          ];
        }),
      );
      await deleteInOrder([...perCharacter.flat(), ...titles.docs.map((d) => [d.ref]), [user]]);
    },

    // ---------------------------------------------------------------- everything else: M3 (with NF-3) and later
    createCharacter: later("createCharacter"),
    updateCharacter: later("updateCharacter"),
    classCorrectionNotice: later("classCorrectionNotice"),
    correctClass: later("correctClass"),
    retireCharacter: later("retireCharacter"),
    restoreCharacter: later("restoreCharacter"),
    deleteCharacter: later("deleteCharacter"),
    listCharacters: later("listCharacters"),
    character: later("character"),
    addTitle: later("addTitle"),
    updateTitle: later("updateTitle"),
    setTitleScope: later("setTitleScope"),
    removeTitle: later("removeTitle"),
    listTitles: later("listTitles"),
    titlesFor: later("titlesFor"),
    charactersFor: later("charactersFor"),
    addEntry: later("addEntry"),
    updateEntry: later("updateEntry"),
    entry: later("entry"),
    listEntries: later("listEntries"),
    markUsed: later("markUsed"),
    restoreUsed: later("restoreUsed"),
    markTraded: later("markTraded"),
    deleteEntry: later("deleteEntry"),
    suggestions: later("suggestions"),
    skillPicker: later("skillPicker"),
    addSkill: later("addSkill"),
    skills: later("skills"),
    skillReplacements: later("skillReplacements", "M5"),
    acceptReplacement: later("acceptReplacement", "M5"),
    addGrant: later("addGrant", "M4"),
    addManualGrant: later("addManualGrant", "M4"),
    removeGrant: later("removeGrant", "M4"),
    equip: later("equip", "M4"),
    unequip: later("unequip", "M4"),
    setActive: later("setActive"),
    totals: later("totals", "M4"),
    alerts: later("alerts", "M4"),
    sheet: later("sheet"),
    lastChange: later("lastChange", "M4"),
    history: later("history"),
    search: later("search"),
    printableSheet: later("printableSheet"),
    printablePdf: later("printablePdf"),
    exportJson: later("exportJson"),
    sendReport: later("sendReport"),
    reports: later("reports"),
    syncStatus: later("syncStatus"),
  };
}
