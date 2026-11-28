// Accounts (section 3.1: AC-1 to AC-5) and invite-only sign-up (NF-13), over
// the fake sign-in. The terms page itself is in tests/browser/phone.spec.ts.

import { expect } from "vitest";
import { createAccounts, type Accounts } from "../../src/data/accounts";
import { AccessDeniedError, ConfirmationError, NotFoundError, ValidationError } from "../../src/errors";
import { FakeAuth } from "../support/fake-auth";
import { rule } from "../support/rule";
import { seedCharacter, seedProfile, world } from "../support/world";

function accountsWorld(invites: string[] | null = null) {
  const w = world();
  const auth = new FakeAuth();
  const store = w.forAuth(auth);
  const accounts = createAccounts({
    auth,
    store: () => store,
    inviteList: async () => (invites === null ? null : new Set(invites)),
  });
  return { w, auth, store, accounts };
}

const signUp = {
  email: "wren@example.test",
  password: "a made-up password",
  displayName: "Wrenna",
  acceptedTerms: true,
};

/** The email's owner opens the verification link, and the app makes the profile (AC-1). */
async function verified(auth: FakeAuth, accounts: Accounts, email = signUp.email) {
  auth.verifyEmail(email);
  return accounts.finishSignUp();
}

rule(
  { req: ["AC-1", "AC-2"], m: "M2" },
  "signing up with email sends a verification email, and the profile is made with the display name once it's verified",
  async () => {
    const { auth, store, accounts } = await accountsWorld();
    await accounts.signUpWithEmail(signUp);
    expect(auth.sentEmails, "emails sent").toEqual([{ to: "wren@example.test", kind: "verification" }]);
    await expect(store.profile(), "Wrenna's profile before verifying").rejects.toThrow(NotFoundError);
    const profile = await verified(auth, accounts);
    expect(profile, "Wrenna's profile").toMatchObject({ displayName: "Wrenna", email: "wren@example.test" });
    expect((await store.profile()).displayName, "the stored display name").toBe("Wrenna");
  },
);

rule({ req: ["AC-1"], m: "M2" }, "a user can sign up and sign in with Google", async () => {
  const { auth, store, accounts } = await accountsWorld();
  auth.nextGoogleAccount = { uid: "google-uid-1", email: "wren.g@example.test" };
  await accounts.signUpWithGoogle({ displayName: "Wren G", acceptedTerms: true });
  await accounts.signOut();
  expect(auth.currentUser(), "after signing out").toBeNull();
  const user = await accounts.signInWithGoogle();
  expect(user.uid, "signed in with Google").toBe("google-uid-1");
  expect((await store.profile()).displayName, "the profile after signing in again").toBe("Wren G");
});

rule(
  { req: ["AC-1"], m: "M2" },
  "a forgotten password can be reset by email, and signing in with the password works",
  async () => {
    const { auth, accounts } = await accountsWorld();
    await accounts.signUpWithEmail(signUp);
    await accounts.signOut();
    await accounts.resetPassword("wren@example.test");
    expect(auth.sentEmails.at(-1), "the last email sent").toEqual({ to: "wren@example.test", kind: "password-reset" });
    const user = await accounts.signInWithEmail("wren@example.test", "a made-up password");
    expect(user.email, "signed in as").toBe("wren@example.test");
  },
);

rule({ req: ["AC-2"], m: "M2" }, "a display name is needed at sign-up and can be changed any time", async () => {
  const { auth, store, accounts } = await accountsWorld();
  const blank = accounts.signUpWithEmail({ ...signUp, displayName: "  " });
  await expect(blank, "signing up with a blank display name").rejects.toMatchObject({ field: "displayName" });
  expect(auth.account("wren@example.test"), "an account created with a blank display name").toBeUndefined();
  await accounts.signUpWithEmail(signUp);
  await verified(auth, accounts);
  await store.setDisplayName("Wren the Wanderer");
  expect((await store.profile()).displayName, "the changed display name").toBe("Wren the Wanderer");
});

rule({ req: ["AC-3"], m: "M2" }, "sign-ins last until the user signs out", async () => {
  const { auth, accounts } = await accountsWorld();
  await accounts.start();
  expect(auth.persistence, "how long sign-ins last").toBe("local");
});

rule({ req: ["AC-4"], m: "M2" }, "an account can't be created without accepting the terms of use", async () => {
  const { auth, accounts } = await accountsWorld();
  const attempt = accounts.signUpWithEmail({ ...signUp, acceptedTerms: false });
  await expect(attempt, "signing up without accepting the terms").rejects.toThrow(ValidationError);
  await expect(attempt, "signing up without accepting the terms").rejects.toMatchObject({ field: "acceptedTerms" });
  expect(auth.account("wren@example.test"), "the sign-in account").toBeUndefined();
  auth.nextGoogleAccount = { uid: "google-uid-2", email: "g2@example.test" };
  await expect(
    accounts.signUpWithGoogle({ displayName: "G2", acceptedTerms: false }),
    "Google sign-up without accepting the terms",
  ).rejects.toMatchObject({ field: "acceptedTerms" });
});

rule(
  { req: ["AC-5"], m: "M2" },
  "deleting an account needs the display name typed; a wrong one deletes nothing",
  async () => {
    const { auth, store, accounts } = await accountsWorld();
    await accounts.signUpWithEmail(signUp);
    await verified(auth, accounts);
    await store.createCharacter({ name: "Rook", className: "Warrior", level: 1 });
    const attempt = accounts.deleteAccount("Wrena");
    await expect(attempt, "deleting with the wrong name").rejects.toThrow(ConfirmationError);
    await expect(attempt, "deleting with the wrong name").rejects.toMatchObject({ expected: "Wrenna" });
    expect(
      (await store.listCharacters("main")).map((c) => c.name),
      "Wrenna's characters",
    ).toEqual(["Rook"]);
  },
);

rule(
  { req: ["AC-5", "PV-2"], m: "M2" },
  "deleting an account removes every record and the sign-in, and nothing of another user's",
  async () => {
    const { w, auth, store, accounts } = await accountsWorld();
    const cass = w.as("cass");
    await seedProfile(cass, "cass");
    await seedCharacter(cass, "brin");
    await accounts.signUpWithEmail(signUp);
    await verified(auth, accounts);
    const oldUid = auth.currentUser()!.uid;
    const rook = await store.createCharacter({ name: "Rook", className: "Warrior", level: 1 });
    const retired = await store.createCharacter({ name: "Old Rook", className: "Warrior", level: 1 });
    await store.retireCharacter(retired.id);
    const tonic = await store.addEntry(rook.id, { category: "consumables", name: "Ember Tonic" });
    await store.addTitle({ name: "Hero of the Bridge" });
    const rookHistory = () => [...w.db.history.values()].filter((h) => h.record.characterId === rook.id);
    expect(rookHistory().length, "Rook's history records before deleting").toBeGreaterThan(0);

    await accounts.deleteAccount("Wrenna");
    expect(auth.account("wren@example.test"), "Wrenna's sign-in").toBeUndefined();
    expect(auth.currentUser(), "signed in after deleting").toBeNull();

    // TF-3: read as the deleted account's own user, and look in the database for
    // what no store can reach once Rook is gone.
    const old = w.forAuth({ currentUser: () => ({ uid: oldUid }) });
    expect(await old.listCharacters("main"), "the deleted account's characters").toEqual([]);
    expect(await old.listCharacters("retired"), "the deleted account's retired characters").toEqual([]);
    expect(await old.listTitles(), "the deleted account's titles").toEqual([]);
    await expect(old.character(rook.id), "reading the old Rook").rejects.toThrow(NotFoundError);
    await expect(old.entry(tonic.id), "reading the old Ember Tonic").rejects.toThrow(NotFoundError);
    expect(
      [...w.db.entries.values()].filter((e) => e.characterId === rook.id),
      "Rook's entries left in the database",
    ).toEqual([]);
    expect(rookHistory(), "Rook's history records left in the database").toEqual([]);
    expect(w.db.profiles.has(oldUid), "Wrenna's profile left in the database").toBe(false);
    expect(
      (await cass.listCharacters("main")).map((c) => c.name),
      "Cass's characters",
    ).toEqual(["Brin"]);
  },
);

rule({ req: ["PV-2"], m: "M2" }, "the profile holds only the sign-in identity and the display name", async () => {
  const { auth, store, accounts } = await accountsWorld();
  await accounts.signUpWithEmail(signUp);
  await verified(auth, accounts);
  expect(Object.keys(await store.profile()).sort(), "the profile's fields").toEqual(["displayName", "email", "uid"]);
});

rule(
  { req: ["NF-13"], m: "M2" },
  "before 1.0, only an invited email can sign up; others are told it's not open yet",
  async () => {
    const { auth, accounts } = await accountsWorld(["wren@example.test"]);
    await accounts.signUpWithEmail(signUp);
    await accounts.signOut();
    const attempt = accounts.signUpWithEmail({ ...signUp, email: "stranger@example.test", displayName: "Stranger" });
    await expect(attempt, "an uninvited sign-up").rejects.toThrow(AccessDeniedError);
    await expect(attempt, "an uninvited sign-up").rejects.toThrow(/not open yet/i);
    expect(auth.account("stranger@example.test"), "the uninvited sign-in account").toBeUndefined();
  },
);

rule({ req: ["NF-13"], m: "M2" }, "once the invite list is removed, anyone can sign up", async () => {
  const { auth, accounts } = await accountsWorld(null);
  await accounts.signUpWithEmail({ ...signUp, email: "anyone@example.test" });
  const profile = await verified(auth, accounts, "anyone@example.test");
  expect(profile.email, "the new account").toBe("anyone@example.test");
});

rule(
  { req: ["AC-1", "AC-2"], m: "M2" },
  "signing up with Google again keeps the existing account's display name",
  async () => {
    const { auth, store, accounts } = await accountsWorld();
    auth.nextGoogleAccount = { uid: "google-uid-3", email: "wren.g@example.test" };
    await accounts.signUpWithGoogle({ displayName: "Wren G", acceptedTerms: true });
    await accounts.signOut();
    const again = await accounts.signUpWithGoogle({ displayName: "Someone Else", acceptedTerms: true });
    expect(again.displayName, "the profile returned").toBe("Wren G");
    expect((await store.profile()).displayName, "the stored display name").toBe("Wren G");
  },
);

rule(
  { req: ["AC-1"], m: "M2" },
  "signing in with a Google account that never signed up is refused and signed out again",
  async () => {
    const { auth, accounts } = await accountsWorld();
    auth.nextGoogleAccount = { uid: "google-uid-4", email: "never@example.test" };
    const attempt = accounts.signInWithGoogle();
    await expect(attempt, "signing in without an account").rejects.toThrow(AccessDeniedError);
    await expect(attempt, "signing in without an account").rejects.toThrow(/no account/i);
    expect(auth.currentUser(), "signed in after the refusal").toBeNull();
  },
);

/** A sign-in service that says the user last signed in long ago. */
class StaleSignInAuth extends FakeAuth {
  async recentlySignedIn(): Promise<boolean> {
    return false;
  }
}

rule(
  { req: ["AC-5"], m: "M2" },
  "without a recent sign-in, deleting the account is refused before anything is removed",
  async () => {
    const w = world();
    const auth = new StaleSignInAuth();
    const store = w.forAuth(auth);
    const accounts = createAccounts({ auth, store: () => store, inviteList: async () => null });
    await accounts.signUpWithEmail(signUp);
    await verified(auth, accounts);
    await store.createCharacter({ name: "Rook", className: "Warrior", level: 1 });
    const attempt = accounts.deleteAccount("Wrenna");
    await expect(attempt, "deleting after a stale sign-in").rejects.toThrow(ValidationError);
    await expect(attempt, "deleting after a stale sign-in").rejects.toThrow(/sign in again/i);
    expect((await store.profile()).displayName, "Wrenna's profile").toBe("Wrenna");
    expect(
      (await store.listCharacters("main")).map((c) => c.name),
      "Wrenna's characters",
    ).toEqual(["Rook"]);
    expect(auth.account("wren@example.test"), "Wrenna's sign-in").toBeDefined();
  },
);

/** A sign-in service that loses its connection when asked to delete a sign-in. */
class NoDeleteAuth extends FakeAuth {
  override async deleteUser(): Promise<void> {
    throw new Error("made-up network failure");
  }
}

rule(
  { req: ["NF-13"], m: "M2" },
  "when the server finds no invite for the email, the user is told why, even if cleaning up fails",
  async () => {
    const w = world();
    const auth = new NoDeleteAuth();
    const store = w.forAuth(auth);
    const refusing = { ...store, invited: async () => false };
    const accounts = createAccounts({ auth, store: () => refusing, inviteList: async () => null });
    await expect(accounts.signUpWithEmail(signUp), "a sign-up the server refuses").rejects.toThrow(/not open yet/i);
  },
);

/** A sign-in service whose verification emails can't be sent. */
class NoEmailAuth extends FakeAuth {
  override async sendEmailVerification(): Promise<void> {
    throw new Error("made-up email outage");
  }
}

rule({ req: ["AC-1", "AC-2"], m: "M2" }, "an account is made even if the verification email can't go yet", async () => {
  const w = world();
  const auth = new NoEmailAuth();
  const store = w.forAuth(auth);
  const accounts = createAccounts({ auth, store: () => store, inviteList: async () => null });
  await accounts.signUpWithEmail(signUp);
  expect(auth.currentUser()?.email, "signed in as").toBe("wren@example.test");
  const profile = await verified(auth, accounts);
  expect(profile.displayName, "the new account's display name").toBe("Wrenna");
  expect((await store.profile()).displayName, "the stored display name").toBe("Wrenna");
});

rule(
  { req: ["AC-1"], m: "M2" },
  "finishing sign-up is refused until the email is verified, and makes no profile",
  async () => {
    const { auth, store, accounts } = await accountsWorld();
    await accounts.signUpWithEmail(signUp);
    const attempt = accounts.finishSignUp();
    await expect(attempt, "finishing before verifying").rejects.toThrow(ValidationError);
    await expect(attempt, "finishing before verifying").rejects.toThrow(/verif/i);
    await expect(store.profile(), "Wrenna's profile after the refusal").rejects.toThrow(NotFoundError);
    expect(accounts.keptDisplayName(), "the display name kept on the phone").toBe("Wrenna");
    expect(auth.account("wren@example.test"), "Wrenna's sign-in").toBeDefined();
  },
);

rule(
  { req: ["AC-1", "AC-2"], m: "M2" },
  "the display name kept on the phone is still there when the app is opened again, and goes once the profile is made",
  async () => {
    const { w, auth, store } = await accountsWorld();
    const phoneStorage = new Map<string, string>();
    const kept = {
      get: (uid: string) => phoneStorage.get(uid),
      set: (uid: string, name: string) => void phoneStorage.set(uid, name),
      delete: (uid: string) => void phoneStorage.delete(uid),
    };
    const open = () => createAccounts({ auth, store: () => store, inviteList: async () => null, kept });
    await open().signUpWithEmail(signUp);
    auth.verifyEmail(signUp.email);
    const reopened = open();
    expect(reopened.keptDisplayName(), "the kept display name after reopening").toBe("Wrenna");
    expect((await reopened.finishSignUp()).displayName, "the profile's display name").toBe("Wrenna");
    expect(reopened.keptDisplayName(), "the kept display name once the profile is made").toBeUndefined();
    expect([...phoneStorage.keys()], "what's left in the phone's storage").toEqual([]);
    expect(w.db.profiles.size, "profiles in the database").toBe(1);
  },
);

rule(
  { req: ["AC-1", "AC-2", "AC-4"], m: "M2" },
  "on a phone that didn't sign up, finishing asks for the display name and the terms again",
  async () => {
    const { auth, store, accounts } = await accountsWorld();
    await accounts.signUpWithEmail(signUp);
    auth.verifyEmail(signUp.email);
    const other = createAccounts({ auth, store: () => store, inviteList: async () => null });
    expect(other.keptDisplayName(), "the display name kept on the other phone").toBeUndefined();
    await expect(other.finishSignUp(), "finishing with nothing kept").rejects.toMatchObject({ field: "displayName" });
    await expect(
      other.finishSignUp({ displayName: "Wren B", acceptedTerms: false }),
      "finishing without accepting the terms",
    ).rejects.toMatchObject({ field: "acceptedTerms" });
    await expect(store.profile(), "the profile before the terms are accepted").rejects.toThrow(NotFoundError);
    const profile = await other.finishSignUp({ displayName: "Wren B", acceptedTerms: true });
    expect(profile, "the profile made on the other phone").toMatchObject({
      displayName: "Wren B",
      email: "wren@example.test",
    });
    expect((await store.profile()).displayName, "the stored display name").toBe("Wren B");
  },
);

rule(
  { req: ["AC-1", "AC-2"], m: "M2" },
  "finishing on the phone that signed up keeps a profile already made on another phone",
  async () => {
    const { auth, store, accounts } = await accountsWorld();
    await accounts.signUpWithEmail(signUp);
    auth.verifyEmail(signUp.email);
    const other = createAccounts({ auth, store: () => store, inviteList: async () => null });
    await other.finishSignUp({ displayName: "Wren Elsewhere", acceptedTerms: true });
    const profile = await accounts.finishSignUp();
    expect(profile.displayName, "the profile the first phone finishes with").toBe("Wren Elsewhere");
    expect((await store.profile()).displayName, "the stored display name").toBe("Wren Elsewhere");
    expect(accounts.keptDisplayName(), "the display name kept on the first phone").toBeUndefined();
  },
);

rule(
  { req: ["NF-13"], m: "M2" },
  "an email taken off the invite list before it's verified is told sign-up isn't open, and gets no profile",
  async () => {
    const { auth, store } = await accountsWorld();
    const refusing = { ...store, createProfile: () => Promise.reject(new AccessDeniedError("refused by the server")) };
    const accounts = createAccounts({ auth, store: () => refusing, inviteList: async () => null });
    await accounts.signUpWithEmail(signUp);
    auth.verifyEmail(signUp.email);
    await expect(accounts.finishSignUp(), "finishing once the invite is gone").rejects.toThrow(/not open yet/i);
    await expect(store.profile(), "Wrenna's profile").rejects.toThrow(NotFoundError);
  },
);
