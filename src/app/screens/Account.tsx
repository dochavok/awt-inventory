// The account page: the display name (AC-2), email verification (AC-1), the
// privacy note (PV-4), signing out, and deleting the account (AC-5).

import { useEffect, useState, type FormEvent } from "react";
import type { Profile } from "../../data/types";
import { NotFoundError } from "../../errors";
import { LIMITS } from "../../data/validate";
import { href } from "../router";
import type { Services } from "../services";
import { VerifyEmail } from "../Shell";
import { Feedback, useAction } from "../useAction";

export function Account({ services }: { services: Services }) {
  const { auth, accounts, store } = services;
  const [profile, setProfile] = useState<Profile | null>(null);
  const [name, setName] = useState("");
  const [typed, setTyped] = useState("");
  /** Signed in, but with no profile: deleting the account stopped partway, or sign-up never finished. */
  const [missing, setMissing] = useState(false);
  const load = useAction();
  const rename = useAction();
  const remove = useAction();

  useEffect(() => {
    void load.run(async () => {
      try {
        const p = await store.profile();
        setProfile(p);
        setName(p.displayName);
      } catch (error) {
        if (!(error instanceof NotFoundError)) throw error;
        setMissing(true);
      }
    });
    // Load once when the page opens.
  }, []);

  const saveName = (e: FormEvent) => {
    e.preventDefault();
    void rename.run(async () => {
      const p = await store.setDisplayName(name);
      setProfile(p);
      return "Display name saved.";
    });
  };

  const deleteAccount = (e: FormEvent) => {
    e.preventDefault();
    void remove.run(async () => {
      await accounts.deleteAccount(typed);
    });
  };

  return (
    <>
      <h1>Your account</h1>
      <Feedback error={load.error} notice={null} />
      <VerifyEmail auth={auth} />
      {profile && (
        <form className="card" onSubmit={saveName}>
          <label>
            Display name
            <input required maxLength={LIMITS.displayName} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <p className="hint">Signed in as {profile.email}</p>
          <Feedback error={rename.error} notice={rename.notice} />
          <button type="submit" disabled={rename.busy || name.trim() === profile.displayName}>
            Save display name
          </button>
        </form>
      )}
      {missing && (
        <section className="card note" aria-labelledby="missing-title">
          <h2 id="missing-title">No account records</h2>
          <p>
            This sign-in has no account: deleting the account stopped partway, or creating it didn&apos;t finish. You
            can remove the sign-in, or sign out and create an account again.
          </p>
          <Feedback error={remove.error} notice={null} />
          <button
            type="button"
            className="danger"
            disabled={remove.busy}
            onClick={() => void remove.run(() => auth.deleteUser())}
          >
            Remove this sign-in
          </button>
        </section>
      )}
      <section className="card">
        <p>
          <a href={href("privacy")}>Privacy note</a>: what the app stores and who can see it.
        </p>
        <button type="button" className="secondary" onClick={() => void accounts.signOut()}>
          Sign out
        </button>
      </section>
      {profile && (
        <>
          <form className="card danger" onSubmit={deleteAccount} aria-labelledby="delete-title">
            <h2 id="delete-title">Delete your account</h2>
            <p>
              This removes every character, entry, title and history record, and your sign-in. It can&apos;t be undone.
            </p>
            <label>
              Type your display name, {profile.displayName}, to confirm
              <input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
            </label>
            <Feedback error={remove.error} notice={null} />
            <button type="submit" className="danger" disabled={remove.busy || typed.trim() !== profile.displayName}>
              Delete my account
            </button>
          </form>
        </>
      )}
    </>
  );
}
