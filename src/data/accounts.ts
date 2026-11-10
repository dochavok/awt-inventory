// Accounts (AC-1 to AC-5): sign-up, sign-in and deletion, over the hosting
// provider's sign-in (AuthProvider) and the data layer. The app never handles
// passwords itself (NF-7).

import { AccessDeniedError, ValidationError } from "../errors";
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
      throw error;
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
      await auth.sendEmailVerification();
      return createProfile(user, displayName, true);
    },

    async signUpWithGoogle(input) {
      const displayName = checkSignUp(input);
      const user = await auth.signInWithGoogle();
      if (!(await invited(user.email))) {
        await auth.signOut();
        throw notOpen();
      }
      return createProfile(user, displayName, false);
    },

    signInWithEmail: (email, password) => auth.signInWithPassword(email, password),
    signInWithGoogle: () => auth.signInWithGoogle(),
    resetPassword: (email) => auth.sendPasswordReset(email),
    signOut: () => auth.signOut(),

    async deleteAccount(typedDisplayName) {
      await context.store().deleteAccount(typedDisplayName);
      await auth.deleteUser();
    },
  };
}
