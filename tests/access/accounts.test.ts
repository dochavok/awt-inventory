// Accounts end to end on the Firebase emulators (AC-1, AC-2, AC-5, PV-2,
// NF-13): the real sign-in adapter (src/platform/firebase-auth.ts), the
// Firestore store's account methods and firestore.rules together. The same
// behaviour over the fake sign-in and in-memory store is in
// tests/data/accounts.test.ts; these check the code that talks to Firebase.

import { deleteApp, initializeApp, type FirebaseApp } from "firebase/app";
import {
  GoogleAuthProvider,
  connectAuthEmulator,
  getAuth,
  signInWithCredential,
  signInWithEmailAndPassword,
  type Auth,
} from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";
import { afterEach, beforeEach, expect } from "vitest";
import { createAccounts } from "../../src/data/accounts";
import { createFirestoreStore } from "../../src/data/firestore-store";
import { AccessDeniedError, ConfirmationError } from "../../src/errors";
import { createFirebaseAuth } from "../../src/platform/firebase-auth";
import { PROJECT_ID, seed, useEmulator } from "../support/emulator";
import { FakeClock } from "../support/fake-clock";
import { testReferenceData } from "../support/fixtures";
import { rule } from "../support/rule";

useEmulator();

const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? "127.0.0.1:9099";
const FIRESTORE_HOST = process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080";

let apps: FirebaseApp[] = [];

beforeEach(async () => {
  await fetch(`http://${AUTH_HOST}/emulator/v1/projects/${PROJECT_ID}/accounts`, { method: "DELETE" });
});

afterEach(async () => {
  await Promise.all(apps.map((app) => deleteApp(app)));
  apps = [];
});

/** A phone running the app: its own Firebase app on the emulators, and the app's accounts over it. */
function phone() {
  const app = initializeApp({ projectId: PROJECT_ID, apiKey: "fake-api-key" }, `phone-${apps.length}-${Date.now()}`);
  apps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${AUTH_HOST}`, { disableWarnings: true });
  const firestore = getFirestore(app);
  const [host, port] = FIRESTORE_HOST.split(":");
  connectFirestoreEmulator(firestore, host!, Number(port));
  const provider = createFirebaseAuth(auth, {
    // The emulator signs in to Google with a made-up credential instead of a popup.
    googleSignIn: (a) =>
      signInWithCredential(
        a,
        GoogleAuthProvider.credential(
          JSON.stringify({ sub: "google-wren", email: "wren.g@example.test", email_verified: true }),
        ),
      ),
  });
  const store = createFirestoreStore(firestore, {
    currentUid: () => auth.currentUser?.uid ?? null,
    clock: new FakeClock(),
    ref: testReferenceData(),
    settings: { showSkillText: false, appVersion: "0.1.0-test" },
  });
  // The server's rules hold the invite list (NF-13); the app can't read it.
  const accounts = createAccounts({ auth: provider, store: () => store, inviteList: async () => null });
  return { auth, provider, store, accounts };
}

/** A document as stored, read past the rules (the emulator's owner access). */
async function stored(path: string): Promise<Record<string, unknown> | null> {
  const response = await fetch(
    `http://${FIRESTORE_HOST}/v1/projects/${PROJECT_ID}/databases/(default)/documents/${path}`,
    { headers: { Authorization: "Bearer owner" } },
  );
  if (response.status === 404) return null;
  const body = (await response.json()) as { fields?: Record<string, unknown> };
  return body.fields ?? {};
}

/** The emails the Auth emulator has "sent", as [email, kind]. */
async function sentEmails(): Promise<[string, string][]> {
  const response = await fetch(`http://${AUTH_HOST}/emulator/v1/projects/${PROJECT_ID}/oobCodes`);
  const body = (await response.json()) as { oobCodes: { email: string; requestType: string }[] };
  return body.oobCodes.map((c) => [c.email, c.requestType]);
}

async function canSignIn(auth: Auth, email: string, password: string): Promise<boolean> {
  try {
    await signInWithEmailAndPassword(auth, email, password);
    return true;
  } catch {
    return false;
  }
}

const wren = { email: "wren@example.test", password: "a made-up password", displayName: "Wrenna", acceptedTerms: true };
const invite = (email: string) => seed({ [`invites/${email}`]: { addedBy: "maintainer" } });

rule(
  { req: ["AC-1", "AC-2", "PV-2", "NF-13"], m: "M2" },
  "an invited email signs up through Firebase: a verification email, and a profile of only the display name and email",
  async () => {
    await invite(wren.email);
    const { auth, accounts } = phone();
    const profile = await accounts.signUpWithEmail(wren);
    expect(profile, "Wrenna's profile").toMatchObject({ displayName: "Wrenna", email: wren.email });
    expect(auth.currentUser?.email, "signed in as").toBe(wren.email);
    expect(await sentEmails(), "emails sent").toEqual([[wren.email, "VERIFY_EMAIL"]]);
    const doc = await stored(`users/${auth.currentUser!.uid}`);
    expect(Object.keys(doc ?? {}).sort(), "the stored profile's fields").toEqual(["displayName", "email"]);
    expect(doc?.displayName, "the stored display name").toEqual({ stringValue: "Wrenna" });
  },
);

rule(
  { req: ["NF-13"], m: "M2" },
  "an email that isn't invited is told sign-up isn't open yet, and no sign-in or profile is left behind",
  async () => {
    const { auth, accounts } = phone();
    const attempt = accounts.signUpWithEmail({ ...wren, email: "stranger@example.test" });
    await expect(attempt, "an uninvited sign-up").rejects.toThrow(AccessDeniedError);
    await expect(attempt, "an uninvited sign-up").rejects.toThrow(/not open yet/i);
    expect(auth.currentUser, "signed in after the refusal").toBeNull();
    expect(await canSignIn(auth, "stranger@example.test", wren.password), "the stranger's sign-in").toBe(false);
  },
);

rule(
  { req: ["AC-1", "AC-3"], m: "M2" },
  "signing out, signing in again with the password, and a reset email for a forgotten one",
  async () => {
    await invite(wren.email);
    const { auth, provider, accounts } = phone();
    await accounts.signUpWithEmail(wren);
    await accounts.signOut();
    expect(provider.currentUser(), "after signing out").toBeNull();
    const user = await accounts.signInWithEmail(wren.email, wren.password);
    expect(user, "signed in again").toMatchObject({ email: wren.email, provider: "password" });
    expect(auth.currentUser?.uid, "the signed-in uid").toBe(user.uid);
    await accounts.resetPassword(wren.email);
    expect((await sentEmails()).at(-1), "the last email sent").toEqual([wren.email, "PASSWORD_RESET"]);
  },
);

rule({ req: ["AC-1", "NF-13"], m: "M2" }, "an invited Google account can sign up, and is known as Google", async () => {
  await invite("wren.g@example.test");
  const { store, accounts } = phone();
  const profile = await accounts.signUpWithGoogle({ displayName: "Wren G", acceptedTerms: true });
  expect(profile, "the Google profile").toMatchObject({ displayName: "Wren G", email: "wren.g@example.test" });
  await accounts.signOut();
  const user = await accounts.signInWithGoogle();
  expect(user, "signed in with Google").toMatchObject({ email: "wren.g@example.test", provider: "google" });
  expect((await store.profile()).displayName, "the profile after signing in again").toBe("Wren G");
});

rule({ req: ["AC-2"], m: "M2" }, "a display name changed in the app is changed on the server", async () => {
  await invite(wren.email);
  const { auth, store, accounts } = phone();
  await accounts.signUpWithEmail(wren);
  await store.setDisplayName("Wren the Wanderer");
  expect((await stored(`users/${auth.currentUser!.uid}`))?.displayName, "the stored display name").toEqual({
    stringValue: "Wren the Wanderer",
  });
});

rule(
  { req: ["AC-5", "HI-4"], m: "M2" },
  "deleting the account removes the profile, characters, entries, history, titles and the sign-in",
  async () => {
    await invite(wren.email);
    const { auth, accounts } = phone();
    await accounts.signUpWithEmail(wren);
    const uid = auth.currentUser!.uid;
    const rook = `users/${uid}/characters/rook`;
    await seed({
      [rook]: { name: "Rook", className: "Warrior", level: 1 },
      [`${rook}/entries/e1`]: { category: "consumables", name: "Ember Tonic", quantity: 1 },
      [`${rook}/history/h1`]: { event: "acquired", entryId: "e1", quantity: 1 },
      [`${rook}/history/h2`]: { event: "level-changed" },
      [`users/${uid}/titles/t1`]: { name: "Hero of the Bridge", scope: { level: "player" } },
    });
    await expect(accounts.deleteAccount("Wrena"), "deleting with the wrong name").rejects.toThrow(ConfirmationError);
    expect(await stored(rook), "Rook after the wrong name").not.toBeNull();

    await accounts.deleteAccount("Wrenna");
    for (const path of [
      `users/${uid}`,
      rook,
      `${rook}/entries/e1`,
      `${rook}/history/h1`,
      `${rook}/history/h2`,
      `users/${uid}/titles/t1`,
    ]) {
      expect(await stored(path), `${path} after deleting the account`).toBeNull();
    }
    expect(auth.currentUser, "signed in after deleting").toBeNull();
    expect(await canSignIn(auth, wren.email, wren.password), "Wrenna's sign-in").toBe(false);
  },
);
