// Accounts (section 3.1: AC-1 to AC-5) and invite-only sign-up (NF-13), over
// the fake sign-in. The terms page itself is in tests/browser/phone.spec.ts.

import { expect } from "vitest";
import { createAccounts } from "../../src/data/accounts";
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

rule(
  { req: ["AC-1", "AC-2"], m: "M2" },
  "signing up with email sends a verification email and creates the profile with the display name",
  async () => {
    const { auth, store, accounts } = await accountsWorld();
    const profile = await accounts.signUpWithEmail(signUp);
    expect(profile, "Wrenna's profile").toMatchObject({ displayName: "Wrenna", email: "wren@example.test" });
    expect(auth.sentEmails, "emails sent").toEqual([{ to: "wren@example.test", kind: "verification" }]);
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
    const { store, accounts } = await accountsWorld();
    await accounts.signUpWithEmail(signUp);
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
    const rook = await store.createCharacter({ name: "Rook", className: "Warrior", level: 1 });
    await store.addEntry(rook.id, { category: "consumables", name: "Ember Tonic" });
    await store.addTitle({ name: "Hero of the Bridge" });

    await accounts.deleteAccount("Wrenna");
    expect(auth.account("wren@example.test"), "Wrenna's sign-in").toBeUndefined();
    expect(auth.currentUser(), "signed in after deleting").toBeNull();

    // Signing up again with the same email starts empty.
    await accounts.signUpWithEmail(signUp);
    expect(await store.listCharacters("main"), "characters after signing up again").toEqual([]);
    expect(await store.listCharacters("retired"), "retired characters after signing up again").toEqual([]);
    expect(await store.listTitles(), "titles after signing up again").toEqual([]);
    await expect(store.character(rook.id), "reading the old Rook").rejects.toThrow(NotFoundError);
    expect(
      (await cass.listCharacters("main")).map((c) => c.name),
      "Cass's characters",
    ).toEqual(["Brin"]);
  },
);

rule({ req: ["PV-2"], m: "M2" }, "the profile holds only the sign-in identity and the display name", async () => {
  const { store, accounts } = await accountsWorld();
  await accounts.signUpWithEmail(signUp);
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
  const { accounts } = await accountsWorld(null);
  const profile = await accounts.signUpWithEmail({ ...signUp, email: "anyone@example.test" });
  expect(profile.email, "the new account").toBe("anyone@example.test");
});
