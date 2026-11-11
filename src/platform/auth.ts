// Sign-in (TF-2, NF-7): the hosting provider's own service (Firebase
// Authentication), behind this port so tests can use a fake. The app never
// handles passwords itself.

export interface AuthUser {
  uid: string;
  email: string;
  emailVerified: boolean;
  provider: "google" | "password";
}

/** How long a sign-in lasts: "local" survives closing the app (AC-3). */
export type Persistence = "local" | "session" | "none";

export interface AuthProvider {
  currentUser(): AuthUser | null;
  setPersistence(persistence: Persistence): Promise<void>;
  createUserWithPassword(email: string, password: string): Promise<AuthUser>;
  signInWithPassword(email: string, password: string): Promise<AuthUser>;
  signInWithGoogle(): Promise<AuthUser>;
  sendEmailVerification(): Promise<void>;
  sendPasswordReset(email: string): Promise<void>;
  signOut(): Promise<void>;
  deleteUser(): Promise<void>;
  /**
   * Whether the user signed in recently enough to delete their sign-in. The
   * provider refuses that otherwise. Absent means the provider doesn't ask (AC-5).
   */
  recentlySignedIn?(): boolean;
  /** Fetches the user's latest state, e.g. once they've verified their email (AC-1). */
  refresh?(): Promise<AuthUser | null>;
}
