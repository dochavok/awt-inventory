// Accounts (AC-1 to AC-5, NF-13): sign-up, sign-in and deletion, over the
// hosting provider's sign-in (AuthProvider) and the data layer. M1 stub.

import { NotImplementedError } from "../errors";
import type { AuthProvider, AuthUser } from "../platform/auth";
import type { InventoryStore } from "./store";
import type { Profile } from "./types";

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

export function createAccounts(_context: AccountsContext): Accounts {
  const fail = (method: string) => () => Promise.reject(new NotImplementedError(`Accounts.${method}`, "M2"));
  return {
    start: fail("start"),
    signUpWithEmail: fail("signUpWithEmail"),
    signUpWithGoogle: fail("signUpWithGoogle"),
    signInWithEmail: fail("signInWithEmail"),
    signInWithGoogle: fail("signInWithGoogle"),
    resetPassword: fail("resetPassword"),
    signOut: fail("signOut"),
    deleteAccount: fail("deleteAccount"),
  };
}
