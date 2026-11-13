// The app's connection to Firebase (section 20): sign-in, the data layer and
// accounts, made once when the app starts.
//
// With no Firebase project configured (the VITE_FIREBASE_* settings), the app
// uses the local emulators under the demo project, as `npm run emulators` starts
// them. The real project comes with M3's first release.

import { initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import {
  connectFirestoreEmulator,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from "firebase/firestore";
import { createAccounts, type Accounts } from "../data/accounts";
import { createFirestoreStore, loadWholeAccount, type RefusedChange } from "../data/firestore-store";
import { loadReferenceData } from "../refdata";
import type { InventoryStore } from "../data/store";
import { systemClock } from "../platform/clock";
import { createFirebaseAuth } from "../platform/firebase-auth";
import type { AuthProvider } from "../platform/auth";
import type { ReferenceData } from "../rules/types";

export const APP_VERSION = __APP_VERSION__;

export interface Services {
  auth: AuthProvider;
  /** Calls `listener` now and whenever someone signs in or out. */
  onSignInChange(listener: () => void): () => void;
  /** Resolves once a sign-in kept from last time has been restored (AC-3), so the first screen is the right one. */
  ready: Promise<void>;
  accounts: Accounts;
  store: InventoryStore;
  /** The reference data from data/ (level chart, slot kinds, rarities, skills…). */
  ref: ReferenceData;
  /** Calls `listener` whenever the server refuses a change made earlier on this phone (NF-3). */
  onWriteRefused(listener: (change: RefusedChange) => void): () => void;
  /** NF-3: reads the whole account, so all of it stays on the phone for use without signal. */
  loadWholeAccount(): Promise<void>;
}

const env = import.meta.env;

function firebaseConfig() {
  if (env.VITE_FIREBASE_PROJECT_ID) {
    return {
      config: {
        apiKey: env.VITE_FIREBASE_API_KEY,
        authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
        projectId: env.VITE_FIREBASE_PROJECT_ID,
        appId: env.VITE_FIREBASE_APP_ID,
      },
      emulators: false,
    };
  }
  return { config: { apiKey: "demo-api-key", projectId: "demo-awt-inventory" }, emulators: true };
}

/** The reference data files in data/, built into the app (section 13); checked as they load. */
function referenceData(): ReferenceData {
  const files = import.meta.glob<string>("../../data/*.yaml", { query: "?raw", import: "default", eager: true });
  return loadReferenceData(
    Object.fromEntries(Object.entries(files).map(([path, text]) => [path.slice(path.lastIndexOf("/") + 1), text])),
  );
}

/** How long after reading the whole account it's read again, on reopening the app or when signal returns. */
const RELOAD_MS = 15 * 60_000;

/**
 * When the whole account was last read, kept on the phone so reopening the app soon after
 * doesn't read it all again. Storage that can't be used (a private window) means it's read.
 */
const LAST_LOAD = "awt.lastWholeAccountRead";

function lastLoad(): { uid: string; at: number } | undefined {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(LAST_LOAD) ?? "null");
    if (typeof value === "object" && value !== null && "uid" in value && "at" in value) {
      const { uid, at } = value;
      if (typeof uid === "string" && typeof at === "number") return { uid, at };
    }
  } catch {
    // Unreadable: read the account again.
  }
  return undefined;
}

function setLastLoad(uid: string, at: number): void {
  try {
    localStorage.setItem(LAST_LOAD, JSON.stringify({ uid, at }));
  } catch {
    // Can't be kept: the next start reads the account again.
  }
}

export function createServices(): Services {
  const ref = referenceData();
  const refusedListeners = new Set<(change: RefusedChange) => void>();
  let loading: { uid: string; done: Promise<void> } | undefined;
  const { config, emulators } = firebaseConfig();
  const app = initializeApp(config);
  const firebaseAuth = getAuth(app);
  // NF-3: what the phone has read stays in its own storage, so it's still there
  // when the app is reopened without signal. Several open tabs share it.
  const firestore = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  });
  if (emulators) {
    const host = window.location.hostname;
    connectAuthEmulator(firebaseAuth, `http://${host}:9099`, { disableWarnings: true });
    connectFirestoreEmulator(firestore, host, 8080);
  }
  const auth = createFirebaseAuth(firebaseAuth);
  const store = createFirestoreStore(
    firestore,
    {
      currentUid: () => firebaseAuth.currentUser?.uid ?? null,
      clock: systemClock,
      ref,
      settings: { showSkillText: false, appVersion: APP_VERSION },
    },
    {
      // NF-3: a change the server refused once it was sent is undone on the phone; the app says which.
      onWriteRefused: (_error, change) => {
        for (const listener of refusedListeners) listener(change);
      },
    },
  );
  // The invite list (NF-13) is enforced by the server's rules, which no user can read past.
  const accounts = createAccounts({ auth, store: () => store, inviteList: async () => null });
  return {
    auth,
    onSignInChange: (listener) => firebaseAuth.onAuthStateChanged(() => listener()),
    ready: firebaseAuth.authStateReady(),
    accounts,
    store,
    ref,
    onWriteRefused(listener) {
      refusedListeners.add(listener);
      return () => refusedListeners.delete(listener);
    },
    loadWholeAccount() {
      const uid = firebaseAuth.currentUser?.uid;
      // Every document read is billed (NF-5): reopening the app, or signal coming and going on a
      // patchy connection, doesn't read everything again each time, and a read under way is shared.
      const last = lastLoad();
      if (!uid || (last?.uid === uid && Math.abs(Date.now() - last.at) < RELOAD_MS)) return Promise.resolve();
      if (loading?.uid === uid) return loading.done;
      const done = loadWholeAccount(firestore, uid)
        .then(() => setLastLoad(uid, Date.now()))
        .finally(() => {
          if (loading?.done === done) loading = undefined;
        });
      loading = { uid, done };
      return done;
    },
  };
}
