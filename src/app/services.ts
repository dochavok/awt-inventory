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

/** How long after reading the whole account it's read again when signal returns. */
const RELOAD_MS = 15 * 60_000;

export function createServices(): Services {
  const ref = referenceData();
  const refusedListeners = new Set<(change: RefusedChange) => void>();
  let lastLoad: { uid: string; at: number } | undefined;
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
    async loadWholeAccount() {
      const uid = firebaseAuth.currentUser?.uid;
      // Every document read is billed (NF-5): signal coming and going on a patchy connection
      // doesn't read everything again each time.
      if (!uid || (lastLoad?.uid === uid && Date.now() - lastLoad.at < RELOAD_MS)) return;
      await loadWholeAccount(firestore, uid);
      lastLoad = { uid, at: Date.now() };
    },
  };
}
