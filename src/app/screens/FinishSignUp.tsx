// AC-1, AC-2, AC-4: finishing an account whose email is verified, on a phone
// that didn't keep the display name from signing up (another phone, or after a
// password reset): the display name and the terms are asked for again.

import { useState, type FormEvent } from "react";
import type { Accounts } from "../../data/accounts";
import { Feedback, useAction } from "../useAction";
import { AcceptTerms, DisplayNameField } from "./SignUpFields";

export function FinishSignUp({ accounts, onFinished }: { accounts: Accounts; onFinished: () => void }) {
  const [displayName, setDisplayName] = useState("");
  const [accepted, setAccepted] = useState(false);
  const { busy, error, notice, run } = useAction();

  const finish = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      await accounts.finishSignUp({ displayName, acceptedTerms: accepted });
      onFinished();
    });
  };

  return (
    <section className="card note" aria-labelledby="finish-title">
      <h2 id="finish-title">Finish creating your account</h2>
      <form onSubmit={finish}>
        <p>Your email is verified. Choose your display name and accept the terms of use to finish.</p>
        <DisplayNameField value={displayName} onChange={setDisplayName} />
        <AcceptTerms accepted={accepted} onChange={setAccepted} />
        <Feedback error={error} notice={notice} />
        <button type="submit" disabled={!accepted || busy}>
          Finish
        </button>
      </form>
    </section>
  );
}
