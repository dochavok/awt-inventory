// The parts around every screen: the header with its links and the screen's
// help link (DOC-1), the connection bar (NF-3), what the server refused
// (NF-3), and the reminder to verify an email (AC-1).

import { useEffect, useState } from "react";
import type { RefusedChange } from "../data/firestore-store";
import type { InventoryStore } from "../data/store";
import type { AuthProvider, AuthUser } from "../platform/auth";
import { href } from "./router";
import { Feedback, useAction } from "./useAction";

export function Header({ signedIn, help }: { signedIn: boolean; help: string }) {
  return (
    <header className="app-header">
      <span className="app-name">AWT Inventory</span>
      <nav aria-label="Main" className="app-nav">
        {signedIn && (
          <>
            <a href={href("characters")}>Characters</a>
            <a href={href("titles")}>Titles</a>
            <a href={href("account")}>Account</a>
          </>
        )}
        <a href={href(help)}>Help</a>
      </nav>
    </header>
  );
}

/** How often the connection bar checks for signal and changes waiting. */
const CHECK_MS = 2_000;

/** NF-3: shows when the app is offline, and how many changes are waiting to be sent. Hidden otherwise. */
export function ConnectionBar({ store }: { store: InventoryStore }) {
  const [status, setStatus] = useState<{ online: boolean; waiting: number }>({ online: true, waiting: 0 });

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // One check at a time: signal coming or going during a check asks for another straight after.
    let running = false;
    let again = false;
    const check = async () => {
      if (running) {
        again = true;
        return;
      }
      running = true;
      clearTimeout(timer);
      const browserOnline = navigator.onLine;
      try {
        const s = await store.syncStatus();
        if (!stopped) setStatus({ online: browserOnline && s.online, waiting: s.pendingChanges });
      } catch {
        if (!stopped) setStatus((old) => ({ ...old, online: browserOnline }));
      }
      running = false;
      if (stopped) return;
      if (again) {
        again = false;
        void check();
      } else timer = setTimeout(() => void check(), CHECK_MS);
    };
    const now = () => void check();
    window.addEventListener("online", now);
    window.addEventListener("offline", now);
    void check();
    return () => {
      stopped = true;
      clearTimeout(timer);
      window.removeEventListener("online", now);
      window.removeEventListener("offline", now);
    };
  }, [store]);

  if (status.online && status.waiting === 0) return null;
  const changes = status.waiting === 1 ? "1 change" : `${status.waiting} changes`;
  return (
    <div role="status" aria-label="Connection" className={`connection ${status.online ? "syncing" : "offline"}`}>
      {status.online
        ? `Sending ${changes}…`
        : `Offline. ${status.waiting === 0 ? "Changes you make are saved on this phone." : `${changes} waiting to be sent.`}`}
    </div>
  );
}

const KIND_NAMES: Record<RefusedChange["kind"], string> = {
  character: "character",
  entry: "entry",
  history: "history record",
  title: "title",
  report: "report",
  profile: "display name",
};

/** What to tell the user about a change the server refused (NF-3). */
export function refusalMessage(change: RefusedChange): string {
  const what = change.name
    ? `the ${KIND_NAMES[change.kind]} "${change.name}"`
    : `a change to a ${KIND_NAMES[change.kind]}`;
  const why =
    change.kind === "character" && change.name
      ? " Another of your characters may already have that name, from another phone."
      : "";
  return `The server refused ${what}, so it's been undone on this phone.${why}`;
}

/** NF-3: tells the user about each change the server refused once it was sent. */
export function RefusedNotices({ subscribe }: { subscribe: (listener: (c: RefusedChange) => void) => () => void }) {
  const [messages, setMessages] = useState<string[]>([]);
  useEffect(() => subscribe((change) => setMessages((old) => [...old, refusalMessage(change)])), [subscribe]);
  if (messages.length === 0) return null;
  return (
    <div className="card error-card" role="alert">
      {messages.map((m, i) => (
        <p key={i}>{m}</p>
      ))}
      <button type="button" className="secondary" onClick={() => setMessages([])}>
        OK
      </button>
    </div>
  );
}

/**
 * AC-1: an email account must be verified before anything can be stored. Shown
 * until it is; picks up a verification done in another tab or app when the app
 * is back in view.
 */
export function VerifyEmail({ auth }: { auth: AuthProvider }) {
  const [user, setUser] = useState<AuthUser | null>(() => auth.currentUser());
  const verify = useAction();

  useEffect(() => {
    if (!auth.refresh) return;
    const recheck = () => {
      if (document.visibilityState === "visible") void auth.refresh?.().then(setUser, () => undefined);
    };
    document.addEventListener("visibilitychange", recheck);
    return () => document.removeEventListener("visibilitychange", recheck);
  }, [auth]);

  if (!user || user.provider !== "password" || user.emailVerified) return null;
  return (
    <section className="card note" aria-labelledby="verify-title">
      <h2 id="verify-title">Check your email</h2>
      <p>
        We sent a link to {user.email} to confirm it&apos;s yours. Until then, nothing can be saved to your account.
      </p>
      <Feedback error={verify.error} notice={verify.notice} />
      <button
        type="button"
        className="secondary"
        disabled={verify.busy}
        onClick={() =>
          void verify.run(async () => {
            await auth.sendEmailVerification();
            return "Sent. Check your inbox.";
          })
        }
      >
        Send the email again
      </button>
      {auth.refresh && (
        <button
          type="button"
          className="secondary"
          disabled={verify.busy}
          onClick={() =>
            void verify.run(async () => {
              const latest = await auth.refresh!();
              setUser(latest);
              if (!latest?.emailVerified) return "Not verified yet. Check for the email, then try again.";
            })
          }
        >
          I&apos;ve verified it
        </button>
      )}
    </section>
  );
}
