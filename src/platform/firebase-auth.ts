// Sign-in through Firebase Authentication (AC-1, NF-7), behind the AuthProvider
// port. Firebase handles passwords, verification and reset emails; the app
// never sees a password beyond passing it on.

import {
  GoogleAuthProvider,
  browserLocalPersistence,
  browserSessionPersistence,
  createUserWithEmailAndPassword,
  deleteUser,
  inMemoryPersistence,
  sendEmailVerification,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type Auth,
  type User,
  type UserCredential,
} from "firebase/auth";
import type { AuthProvider, AuthUser, Persistence } from "./auth";

const PERSISTENCE = {
  local: browserLocalPersistence,
  session: browserSessionPersistence,
  none: inMemoryPersistence,
} as const;

function toAuthUser(user: User): AuthUser {
  return {
    uid: user.uid,
    email: user.email ?? "",
    emailVerified: user.emailVerified,
    provider: user.providerData.some((p) => p.providerId === GoogleAuthProvider.PROVIDER_ID) ? "google" : "password",
  };
}

export interface FirebaseAuthOptions {
  /** How Google sign-in happens: a popup in the app; tests sign in with a credential. */
  googleSignIn?: (auth: Auth) => Promise<UserCredential>;
}

export function createFirebaseAuth(auth: Auth, options: FirebaseAuthOptions = {}): AuthProvider {
  const googleSignIn = options.googleSignIn ?? ((a: Auth) => signInWithPopup(a, new GoogleAuthProvider()));

  function signedIn(): User {
    if (!auth.currentUser) throw new Error("No one is signed in.");
    return auth.currentUser;
  }

  return {
    currentUser: () => (auth.currentUser ? toAuthUser(auth.currentUser) : null),
    setPersistence: (persistence: Persistence) => setPersistence(auth, PERSISTENCE[persistence]),
    async createUserWithPassword(email, password) {
      return toAuthUser((await createUserWithEmailAndPassword(auth, email, password)).user);
    },
    async signInWithPassword(email, password) {
      return toAuthUser((await signInWithEmailAndPassword(auth, email, password)).user);
    },
    async signInWithGoogle() {
      return toAuthUser((await googleSignIn(auth)).user);
    },
    sendEmailVerification: () => sendEmailVerification(signedIn()),
    sendPasswordReset: (email) => sendPasswordResetEmail(auth, email),
    signOut: () => signOut(auth),
    deleteUser: () => deleteUser(signedIn()),
  };
}
