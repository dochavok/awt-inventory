// AC-1: signing in with an email and password, or with Google; a reset email
// for a forgotten password. The start screen when no one is signed in.

import { useState, type FormEvent } from "react";
import type { Accounts } from "../../data/accounts";
import type { InventoryStore } from "../../data/store";
import { AccessDeniedError, NotFoundError } from "../../errors";
import { href } from "../router";
import { Feedback, useAction } from "../useAction";
import { HomeScreenHelp } from "./HomeScreenHelp";

export function SignIn({ accounts, store }: { accounts: Accounts; store: InventoryStore }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { busy, error, notice, run } = useAction();

  const signIn = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      await accounts.signInWithEmail(email.trim(), password);
    });
  };

  // A Google account that never signed up has no profile: sign it out and say so.
  const withGoogle = () =>
    run(async () => {
      await accounts.signInWithGoogle();
      try {
        await store.profile();
      } catch (error) {
        if (!(error instanceof NotFoundError)) throw error;
        await accounts.signOut();
        throw new AccessDeniedError("There's no account for that Google account yet. Create an account first.");
      }
    });

  const reset = () =>
    run(async () => {
      if (!email.trim()) throw Object.assign(new Error(), { code: "auth/invalid-email" });
      await accounts.resetPassword(email.trim());
      return `If there's an account for ${email.trim()}, a reset email is on its way.`;
    });

  return (
    <>
      <h1>Sign in</h1>
      <form className="card" onSubmit={signIn}>
        <label>
          Email
          <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          Password
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <Feedback error={error} notice={notice} />
        <button type="submit" disabled={busy}>
          Sign in
        </button>
        <button type="button" className="link-button" onClick={() => void reset()} disabled={busy}>
          Forgot your password?
        </button>
      </form>
      <div className="card">
        <button type="button" className="secondary" disabled={busy} onClick={() => void withGoogle()}>
          Sign in with Google
        </button>
      </div>
      <p className="center">
        New here? <a href={href("sign-up")}>Create an account</a>
      </p>
      <HomeScreenHelp />
    </>
  );
}
