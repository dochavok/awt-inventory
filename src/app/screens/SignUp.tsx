// AC-1, AC-2, AC-4, PV-4: creating an account with a display name, after
// accepting the terms of use, with email and password or with Google.

import { useState, type FormEvent } from "react";
import type { Accounts } from "../../data/accounts";
import { LIMITS } from "../../data/validate";
import { go, href } from "../router";
import { Feedback, useAction } from "../useAction";
import { Terms } from "./Terms";

export function SignUp({ accounts, onBusy }: { accounts: Accounts; onBusy: (busy: boolean) => void }) {
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [accepted, setAccepted] = useState(false);
  // This screen stays up while signing up (onBusy), then the account page opens if it worked.
  const { busy, error, notice, run } = useAction(onBusy);

  const signUp = (action: () => Promise<unknown>) =>
    run(async () => {
      await action();
      go("account");
    });

  const create = (e: FormEvent) => {
    e.preventDefault();
    void signUp(() =>
      accounts.signUpWithEmail({ displayName, email: email.trim(), password, acceptedTerms: accepted }),
    );
  };

  const withGoogle = () => signUp(() => accounts.signUpWithGoogle({ displayName, acceptedTerms: accepted }));

  return (
    <>
      <h1>Create an account</h1>
      <form className="card" onSubmit={create}>
        <label>
          Display name
          <input
            autoComplete="nickname"
            required
            maxLength={LIMITS.displayName}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
          <span className="hint">
            Other players see only this, if you list something for trade. No real name needed.
          </span>
        </label>
        <label>
          Email
          <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          Password
          <input
            type="password"
            autoComplete="new-password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <Terms />
        <label className="check">
          <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />I accept the terms
          of use
        </label>
        <p className="hint">
          What the app stores and who can see it: <a href={href("privacy")}>Privacy note</a>
        </p>
        <Feedback error={error} notice={notice} />
        <button type="submit" disabled={!accepted || busy}>
          Create account
        </button>
        <button type="button" className="secondary" disabled={!accepted || busy} onClick={() => void withGoogle()}>
          Sign up with Google
        </button>
      </form>
      <p className="center">
        Already have an account? <a href={href("sign-in")}>Sign in</a>
      </p>
    </>
  );
}
