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
  /**
   * Makes the sign-in and sends the verification email. The profile waits until the
   * email is verified (AC-1); the display name is kept on this phone until then.
   */
  signUpWithEmail(input: SignUp & { email: string; password: string }): Promise<AuthUser>;
  /**
   * AC-1: makes the profile once the email is verified, with the display name kept
   * on this phone, or with `input` where nothing was kept. A profile already made
   * (on another phone, say) is kept as it is.
   */
  finishSignUp(input?: SignUp): Promise<Profile>;
  /** The display name this phone kept from signing up, for whoever is signed in. */
  keptDisplayName(): string | undefined;
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
  /**
   * AC-1: the phone's own storage for the display name chosen at sign-up, by uid,
   * until the profile is made. Kept in memory when absent.
   */
  kept?: KeptSignUps;
}

/** Display names kept on the phone between signing up and verifying the email (AC-1). */
export interface KeptSignUps {
  get(uid: string): string | undefined;
  set(uid: string, displayName: string): void;
  delete(uid: string): void;
}

function keptInMemory(): KeptSignUps {
  const names = new Map<string, string>();
  return {
    get: (uid) => names.get(uid),
    set: (uid, name) => void names.set(uid, name),
    delete: (uid) => void names.delete(uid),
  };
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
  const kept = context.kept ?? keptInMemory();

  /** NF-13: before 1.0, only an email on the invite list may sign up. */
  async function invited(email: string): Promise<boolean> {
    const list = await context.inviteList();
    return list === null || list.has(email.trim().toLowerCase());
  }

  const notOpen = () =>
    new AccessDeniedError("Sign-up is not open yet: the app is invite-only until its first full release.");

  /**
   * The profile for the Google account just signed in to. If it can't be made (e.g.
   * the server refuses an email that isn't invited), it's signed out again, so
   * nothing is left half made.
   */
  async function createGoogleProfile(user: AuthUser, displayName: string): Promise<Profile> {
    try {
      return await context.store().createProfile({ displayName, email: user.email });
    } catch (error) {
      // Clean up as far as possible, but the reason shown is why the profile was refused.
      await auth.signOut().catch(() => undefined);
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
      // NF-13: the server says straight away whether this email is invited, so an
      // uninvited one is told now, and its sign-in removed, not after verifying.
      let onTheList: boolean;
      try {
        onTheList = await context.store().invited(user.email);
      } catch (error) {
        await auth.deleteUser().catch(() => undefined);
        throw error;
      }
      if (!onTheList) {
        await auth.deleteUser().catch(() => undefined);
        throw notOpen();
      }
      kept.set(user.uid, displayName);
      // The sign-in is made either way: if the email can't go now, the app offers to send it again.
      await auth.sendEmailVerification().catch(() => undefined);
      return user;
    },

    async finishSignUp(input) {
      const user = (await auth.refresh?.()) ?? auth.currentUser();
      if (!user) throw new ValidationError("signIn", "Sign in first.");
      if (!user.emailVerified) {
        throw new ValidationError("email", "Verify your email first: open the link in the email the app sent you.");
      }
      const existing = await context
        .store()
        .profile()
        .catch((error: unknown) => {
          if (error instanceof NotFoundError) return null;
          throw error;
        });
      if (existing) {
        kept.delete(user.uid);
        return existing;
      }
      const displayName = input ? checkSignUp(input) : kept.get(user.uid);
      if (displayName === undefined) {
        throw new ValidationError("displayName", "Choose a display name to finish creating your account.");
      }
      let profile: Profile;
      try {
        profile = await context.store().createProfile({ displayName, email: user.email });
      } catch (error) {
        // The email was verified, so the refusal is the invite list (NF-13): taken off it since signing up.
        throw error instanceof AccessDeniedError ? notOpen() : error;
      }
      kept.delete(user.uid);
      return profile;
    },

    keptDisplayName() {
      const user = auth.currentUser();
      return user ? kept.get(user.uid) : undefined;
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
      return existing ?? createGoogleProfile(user, displayName);
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
      // The sign-in can only be deleted after a recent sign-in; check before any record goes,
      // so a refusal never leaves the records gone and the sign-in still there.
      if (auth.recentlySignedIn && !(await auth.recentlySignedIn())) {
        throw new ValidationError(
          "signIn",
          "For your safety, sign out and sign in again, then delete your account within a few minutes.",
        );
      }
      await context.store().deleteAccount(typedDisplayName);
      await auth.deleteUser();
    },
  };
}
