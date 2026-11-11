// The app's connection to Firebase (section 20): sign-in, the data layer and
// accounts, made once when the app starts.
//
// M2 runs only in a test environment. With no Firebase project configured (the
// VITE_FIREBASE_* settings), the app uses the local emulators under the demo
// project, as `npm run emulators` starts them. The real project comes in M3.

import { initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import {
  connectFirestoreEmulator,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from "firebase/firestore";
import { createAccounts, type Accounts } from "../data/accounts";
import { createFirestoreStore } from "../data/firestore-store";
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

/** The account screens need no reference data yet; the character screens (M3) load data/. */
const NO_REFERENCE_DATA = {} as ReferenceData;

export function createServices(): Services {
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
  const store = createFirestoreStore(firestore, {
    currentUid: () => firebaseAuth.currentUser?.uid ?? null,
    clock: systemClock,
    ref: NO_REFERENCE_DATA,
    settings: { showSkillText: false, appVersion: APP_VERSION },
  });
  // The invite list (NF-13) is enforced by the server's rules, which no user can read past.
  const accounts = createAccounts({ auth, store: () => store, inviteList: async () => null });
  return {
    auth,
    onSignInChange: (listener) => firebaseAuth.onAuthStateChanged(() => listener()),
    ready: firebaseAuth.authStateReady(),
    accounts,
    store,
  };
}
