// A fake of the hosting provider's sign-in (TF-2, AC-1). It keeps accounts in
// memory, records the emails it "sends" and the persistence asked for, and
// signs in with Google as whatever account `nextGoogleAccount` names.

import type { AuthProvider, AuthUser, Persistence } from "../../src/platform/auth";

export interface SentEmail {
  to: string;
  kind: "verification" | "password-reset";
}

export class FakeAuthError extends Error {
  override readonly name = "FakeAuthError";
  constructor(readonly code: string) {
    super(code);
  }
}

export class FakeAuth implements AuthProvider {
  readonly sentEmails: SentEmail[] = [];
  persistence: Persistence | undefined;
  nextGoogleAccount: { uid: string; email: string } | undefined;
  private readonly accounts = new Map<string, { user: AuthUser; password?: string }>();
  private signedIn: AuthUser | null = null;
  private nextUid = 1;

  currentUser(): AuthUser | null {
    return this.signedIn;
  }

  async setPersistence(persistence: Persistence): Promise<void> {
    this.persistence = persistence;
  }

  async createUserWithPassword(email: string, password: string): Promise<AuthUser> {
    if (this.accounts.has(email)) throw new FakeAuthError("auth/email-already-in-use");
    const user: AuthUser = { uid: `fake-uid-${this.nextUid++}`, email, emailVerified: false, provider: "password" };
    this.accounts.set(email, { user, password });
    this.signedIn = user;
    return user;
  }

  async signInWithPassword(email: string, password: string): Promise<AuthUser> {
    const account = this.accounts.get(email);
    if (!account || account.password !== password) throw new FakeAuthError("auth/invalid-credential");
    this.signedIn = account.user;
    return account.user;
  }

  async signInWithGoogle(): Promise<AuthUser> {
    const google = this.nextGoogleAccount;
    if (!google) throw new FakeAuthError("auth/popup-closed-by-user");
    const existing = this.accounts.get(google.email);
    const user = existing?.user ?? {
      uid: google.uid,
      email: google.email,
      emailVerified: true,
      provider: "google" as const,
    };
    if (!existing) this.accounts.set(google.email, { user });
    this.signedIn = user;
    return user;
  }

  async sendEmailVerification(): Promise<void> {
    if (!this.signedIn) throw new FakeAuthError("auth/no-current-user");
    this.sentEmails.push({ to: this.signedIn.email, kind: "verification" });
  }

  async sendPasswordReset(email: string): Promise<void> {
    // Like the real service, it doesn't reveal whether the account exists.
    if (this.accounts.has(email)) this.sentEmails.push({ to: email, kind: "password-reset" });
  }

  async signOut(): Promise<void> {
    this.signedIn = null;
  }

  async deleteUser(): Promise<void> {
    if (!this.signedIn) throw new FakeAuthError("auth/no-current-user");
    this.accounts.delete(this.signedIn.email);
    this.signedIn = null;
  }

  /** Test helper: the account for an email, if it exists. */
  account(email: string): AuthUser | undefined {
    return this.accounts.get(email)?.user;
  }
}
