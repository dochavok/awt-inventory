// Accounts (AC-1 to AC-5): sign-up, sign-in and deletion, over the hosting
// provider's sign-in (AuthProvider) and the data layer. The app never handles
// passwords itself (NF-7).

import { AccessDeniedError, NotFoundError, ValidationError } from "../errors";
import type { AuthProvider, AuthUser } from "../platform/auth";
import type { InventoryStore } from "./store";
import type { Profile } from "./types";
import * as check from "./validate";

export interface SignUp {
  displayName: string;
  /** The terms of use must be accepted (AC-4). */
  acceptedTerms: boolean;
}

export interface Accounts {
  /** Called when the app starts: sign-ins last until signing out (AC-3). */
  start(): Promise<void>;
  signUpWithEmail(input: SignUp & { email: string; password: string }): Promise<Profile>;
  signUpWithGoogle(input: SignUp): Promise<Profile>;
  signInWithEmail(email: string, password: string): Promise<AuthUser>;
  signInWithGoogle(): Promise<AuthUser>;
  resetPassword(email: string): Promise<void>;
  signOut(): Promise<void>;
  /** AC-5: removes every record and the sign-in itself. */
  deleteAccount(typedDisplayName: string): Promise<void>;
}

export interface AccountsContext {
  auth: AuthProvider;
  /** The data layer for whoever is signed in. */
  store: () => InventoryStore;
  /** NF-13: emails allowed to sign up before 1.0; null once sign-up is open to all. */
  inviteList: () => Promise<Set<string> | null>;
}

/** What every sign-up needs before an account is created: the terms accepted and a display name (AC-2, AC-4). */
function checkSignUp(input: SignUp): string {
  if (input.acceptedTerms !== true) {
    throw new ValidationError("acceptedTerms", "Accept the terms of use to create an account.");
  }
  return check.displayName(input.displayName);
}

export function createAccounts(context: AccountsContext): Accounts {
  const { auth } = context;

  /** NF-13: before 1.0, only an email on the invite list may sign up. */
  async function invited(email: string): Promise<boolean> {
    const list = await context.inviteList();
    return list === null || list.has(email.trim().toLowerCase());
  }

  const notOpen = () =>
    new AccessDeniedError("Sign-up is not open yet: the app is invite-only until its first full release.");

  /**
   * The profile for the account just signed in to. If it can't be made (e.g. the
   * server refuses an email that isn't invited), a new email sign-in is removed
   * and a Google one signed out, so nothing is left half made.
   */
  async function createProfile(user: AuthUser, displayName: string, isNew: boolean): Promise<Profile> {
    try {
      return await context.store().createProfile({ displayName, email: user.email });
    } catch (error) {
      await (isNew ? auth.deleteUser() : auth.signOut());
      // A server that refuses a new profile is enforcing the invite list (NF-13).
      throw error instanceof AccessDeniedError ? notOpen() : error;
    }
  }

  return {
    async start() {
      await auth.setPersistence("local");
    },

    async signUpWithEmail(input) {
      const displayName = checkSignUp(input);
      if (!(await invited(input.email))) throw notOpen();
      const user = await auth.createUserWithPassword(input.email, input.password);
      const profile = await createProfile(user, displayName, true);
      // The account is made either way: if the email can't go now, the account page sends it again.
      await auth.sendEmailVerification().catch(() => undefined);
      return profile;
    },

    async signUpWithGoogle(input) {
      const displayName = checkSignUp(input);
      const user = await auth.signInWithGoogle();
      if (!(await invited(user.email))) {
        await auth.signOut();
        throw notOpen();
      }
      // A Google account that already has an account is simply signed in; its profile is kept.
      const existing = await context
        .store()
        .profile()
        .catch((error: unknown) => {
          if (error instanceof NotFoundError) return null;
          throw error;
        });
      return existing ?? createProfile(user, displayName, false);
    },

    signInWithEmail: (email, password) => auth.signInWithPassword(email, password),
    // A Google account that never signed up has no profile: it's signed out again, with the reason.
    async signInWithGoogle() {
      const user = await auth.signInWithGoogle();
      try {
        await context.store().profile();
      } catch (error) {
        if (!(error instanceof NotFoundError)) throw error;
        await auth.signOut();
        throw new AccessDeniedError("There's no account for that Google account yet. Create an account first.");
      }
      return user;
    },
    resetPassword: (email) => auth.sendPasswordReset(email),
    signOut: () => auth.signOut(),

    async deleteAccount(typedDisplayName) {
      await context.store().deleteAccount(typedDisplayName);
      await auth.deleteUser();
    },
  };
}
