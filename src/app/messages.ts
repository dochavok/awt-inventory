// What to tell the user when something is refused or fails: the app's own
// refusals say what was wrong; Firebase's sign-in errors are put in plain words.

import { AppError } from "../errors";

const AUTH_MESSAGES: Record<string, string> = {
  "auth/invalid-credential": "That email and password don't match an account.",
  "auth/invalid-email": "That doesn't look like an email address.",
  "auth/user-not-found": "That email and password don't match an account.",
  "auth/wrong-password": "That email and password don't match an account.",
  "auth/email-already-in-use": "There's already an account with that email. Sign in instead.",
  "auth/weak-password": "Choose a longer password: at least 6 characters.",
  "auth/missing-password": "Enter your password.",
  "auth/too-many-requests": "Too many tries. Wait a few minutes, then try again.",
  "auth/network-request-failed": "No signal. Try again when you're connected.",
  "auth/popup-closed-by-user": "Google sign-in was closed before it finished.",
  "auth/popup-blocked": "The browser blocked the Google sign-in window. Allow pop-ups and try again.",
  "auth/requires-recent-login": "For your safety, sign out and sign in again, then try once more.",
};

export function messageFor(error: unknown): string {
  if (error instanceof AppError) return error.message;
  const code = (error as { code?: unknown }).code;
  if (typeof code === "string" && code in AUTH_MESSAGES) return AUTH_MESSAGES[code]!;
  return "Something went wrong. Please try again.";
}
