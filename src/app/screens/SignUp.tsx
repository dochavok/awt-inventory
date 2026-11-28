// AC-1, AC-2, AC-4, PV-4: creating an account with a display name, after
// accepting the terms of use, with email and password or with Google.

import { useState, type FormEvent } from "react";
import type { Accounts } from "../../data/accounts";
import { go, href } from "../router";
import { Feedback, useAction } from "../useAction";
import { AcceptTerms, DisplayNameField } from "./SignUpFields";

export function SignUp({ accounts, onBusy }: { accounts: Accounts; onBusy: (busy: boolean) => void }) {
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [accepted, setAccepted] = useState(false);
  // This screen stays up while signing up (onBusy), then the characters screen opens if it worked.
  const { busy, error, notice, run } = useAction(onBusy);

  const signUp = (action: () => Promise<unknown>) =>
    run(async () => {
      await action();
      go("characters");
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
        <DisplayNameField value={displayName} onChange={setDisplayName} />
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
        <AcceptTerms accepted={accepted} onChange={setAccepted} />
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
