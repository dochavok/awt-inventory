// The parts around every screen: the header with its links and the screen's
// help link (DOC-1), the connection bar (NF-3), the new-version bar (NF-14),
// what the server refused (NF-3), and the reminder to verify an email (AC-1).

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { Accounts } from "../data/accounts";
import type { RefusedChange } from "../data/firestore-store";
import { ValidationError } from "../errors";
import { FinishSignUp } from "./screens/FinishSignUp";
import type { InventoryStore } from "../data/store";
import type { AuthProvider, AuthUser } from "../platform/auth";
import type { NewVersion } from "./new-version";
import { href } from "./router";
import { Feedback, useAction } from "./useAction";

/** `help` is the help page for the screen shown; none while the app doesn't yet know which screen that is. */
export function Header({ signedIn, help }: { signedIn: boolean; help: string | undefined }) {
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
        {help !== undefined && <a href={href(help)}>Help</a>}
      </nav>
    </header>
  );
}

/** How often the connection bar checks for signal and changes waiting. */
const CHECK_MS = 2_000;

interface Status {
  online: boolean;
  waiting: number;
}

/** NF-3: shows when the app is offline, and how many changes are waiting to be sent. Hidden otherwise. */
export function ConnectionBar({ store }: { store: InventoryStore }) {
  const [status, setStatus] = useState<Status>({ online: true, waiting: 0 });

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
      // The same status as before keeps the same object, so the bar isn't drawn again.
      const show = (next: (old: Status) => Status) =>
        setStatus((old) => {
          const value = next(old);
          return value.online === old.online && value.waiting === old.waiting ? old : value;
        });
      try {
        const s = await store.syncStatus();
        if (!stopped) show(() => ({ online: browserOnline && s.online, waiting: s.pendingChanges }));
      } catch {
        if (!stopped) show((old) => ({ ...old, online: browserOnline }));
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

/** NF-14: offers a new version once it's stored on the phone. It never reloads by itself. */
export function NewVersionBar({ newVersion }: { newVersion: NewVersion }) {
  const ready = useSyncExternalStore(newVersion.subscribe, newVersion.ready);
  const [reloading, setReloading] = useState(false);
  if (!ready) return null;
  return (
    <div role="status" aria-label="New version" className="connection new-version">
      A new version is ready.{" "}
      <button
        type="button"
        className="secondary"
        disabled={reloading}
        onClick={() => {
          setReloading(true);
          newVersion.reload().catch((error: unknown) => {
            console.warn("Couldn't switch to the new version", error);
            setReloading(false);
          });
        }}
      >
        Reload
      </button>
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

/** Email sign-ins known to have their profile, this session, so it isn't looked up again on every screen. */
const finished = new Set<string>();

/**
 * AC-1: an email account must be verified before anything can be stored, and its
 * profile is made only then. Shown until it is; picks up a verification done in
 * another tab or app when the app is back in view. Once verified, the profile is
 * made with the display name this phone kept, or the user is asked for one.
 */
export function VerifyEmail({
  auth,
  accounts,
  onFinished,
}: {
  auth: AuthProvider;
  accounts: Accounts;
  onFinished?: () => void;
}) {
  const [user, setUser] = useState<AuthUser | null>(() => auth.currentUser());
  const [askName, setAskName] = useState(false);
  const verify = useAction();
  // The latest callback, without making the check below run again on every render.
  const finishedCallback = useRef(onFinished);
  finishedCallback.current = onFinished;

  /** Makes the profile of a verified email sign-in that has none yet. */
  const finish = useCallback(
    async (latest: AuthUser | null) => {
      if (!latest || latest.provider !== "password" || !latest.emailVerified || finished.has(latest.uid)) return;
      try {
        await accounts.finishSignUp();
      } catch (error) {
        if (!(error instanceof ValidationError && error.field === "displayName")) throw error;
        setAskName(true);
        return;
      }
      finished.add(latest.uid);
      setAskName(false);
      finishedCallback.current?.();
    },
    [accounts],
  );

  useEffect(() => {
    // Without signal the profile may not be readable; it's tried again on the next screen.
    void finish(auth.currentUser()).catch(() => undefined);
    if (!auth.refresh) return;
    const recheck = () => {
      if (document.visibilityState !== "visible") return;
      void auth
        .refresh?.()
        .then(async (latest) => {
          await finish(latest);
          setUser(latest);
        })
        .catch(() => undefined);
    };
    document.addEventListener("visibilitychange", recheck);
    return () => document.removeEventListener("visibilitychange", recheck);
  }, [auth, finish]);

  if (askName) {
    return (
      <FinishSignUp
        accounts={accounts}
        onFinished={() => {
          if (user) finished.add(user.uid);
          setAskName(false);
          onFinished?.();
        }}
      />
    );
  }
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
              // The notice stays until the profile is made, so nothing is stored before it exists.
              await finish(latest);
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
