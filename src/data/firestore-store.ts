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
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  writeBatch,
  type DocumentReference,
  type Firestore,
} from "firebase/firestore";
import { AccessDeniedError, ConfirmationError, NotFoundError, NotImplementedError } from "../errors";
import type { InventoryStore, StoreContext } from "./store";
import type { Profile } from "./types";
import * as check from "./validate";

/** Firestore's limit on writes in one batch. */
const BATCH_LIMIT = 500;

const later =
  (what: string, milestone = "M3") =>
  async (): Promise<never> => {
    throw new NotImplementedError(`FirestoreStore.${what}`, milestone);
  };

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

  function uid(): string {
    const current = context.currentUid();
    if (current === null) throw new AccessDeniedError("Sign in first.");
    return current;
  }

  const profileRef = (): DocumentReference => doc(db, "users", uid());

  async function readProfile(): Promise<Profile> {
    const me = uid();
    const snap = await getDoc(profileRef());
    if (!snap.exists()) throw new NotFoundError("profile", me);
    const data = snap.data() as { displayName: string; email?: string };
    return { uid: me, displayName: data.displayName, email: data.email ?? "" };
  }

  /** Deletes documents in batches. The first batch also deletes `first`, so history records may go with it (HI-4). */
  async function deleteAll(first: DocumentReference, others: DocumentReference[]): Promise<void> {
    const refs = [first, ...others];
    for (let i = 0; i < refs.length; i += BATCH_LIMIT) {
      const batch = writeBatch(db);
      for (const ref of refs.slice(i, i + BATCH_LIMIT)) batch.delete(ref);
      await batch.commit();
    }
  }

  return {
    // ---------------------------------------------------------------- account (AC, PV)
    async createProfile(input) {
      const profile: Profile = {
        uid: uid(),
        displayName: check.displayName(input.displayName),
        email: check.requiredText("email", input.email, 320, "email address"),
      };
      try {
        await setDoc(profileRef(), { displayName: profile.displayName, email: profile.email });
      } catch (error) {
        // The rules refuse a profile for an email that isn't invited (NF-13).
        if (isPermissionDenied(error)) {
          throw new AccessDeniedError("Sign-up is not open yet: the app is invite-only until its first full release.");
        }
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
      for (const character of (await getDocs(collection(user, "characters"))).docs) {
        const [entries, history] = await Promise.all([
          getDocs(collection(character.ref, "entries")),
          getDocs(collection(character.ref, "history")),
        ]);
        await deleteAll(
          character.ref,
          [...entries.docs, ...history.docs].map((d) => d.ref),
        );
      }
      for (const title of (await getDocs(collection(user, "titles"))).docs) await deleteDoc(title.ref);
      await deleteDoc(user);
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
