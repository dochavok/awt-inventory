// The app shell: which screen shows, from the address and whether someone is
// signed in. Sign-ins last until the user signs out (AC-3). With signal, the
// whole account is read once signed in, so all of it stays on the phone (NF-3).

import { useEffect, useRef, useState } from "react";
import { characterOf, type RefusedChange } from "../data/firestore-store";
import { characterOfRoute, useRoute, type Route } from "./router";
import type { Services } from "./services";
import { ConnectionBar, Header, RefusedNotices } from "./Shell";
import { Account } from "./screens/Account";
import { CharacterPage, Characters, NewCharacter } from "./screens/Characters";
import { Category, EntryPage } from "./screens/Entries";
import { Help, helpFor } from "./screens/Help";
import { History } from "./screens/History";
import { ReportForm } from "./screens/Report";
import { Skills } from "./screens/Skills";
import { Privacy } from "./screens/Privacy";
import { SignIn } from "./screens/SignIn";
import { SignUp } from "./screens/SignUp";
import { Titles } from "./screens/Titles";

/** Whether a screen shows the record a refused change was to, so the change must leave it (NF-3). */
function shows(route: Route | null, { kind, id }: RefusedChange): boolean {
  const shown = characterOfRoute(route);
  if (shown !== undefined) {
    // A character's screens show that character, its entries and history, and titles.
    if (kind === "profile" || kind === "report") return false;
    if (kind === "title" || id === undefined) return true;
    return (kind === "character" ? id : characterOf(id)) === shown;
  }
  switch (route?.screen) {
    case "titles":
      return kind === "title" || kind === "character";
    case "account":
      return kind === "profile";
    case "help":
    case "privacy":
    case "new-character":
    case "report":
      return false;
    default:
      // The characters list, at its own address or the start one.
      return kind === "character";
  }
}

/** How long after the app opens the whole account is read (NF-3, NF-4). */
const LOAD_DELAY_MS = 2_000;

export function App({ services }: { services: Services }) {
  const route = useRoute();
  const [signedIn, setSignedIn] = useState(() => services.auth.currentUser() !== null);
  // Firebase signs in before sign-up has made the profile, or before sign-in has
  // checked there is one. While either runs, its screen stays, so what happens
  // (or why it was refused) is shown there.
  const [holding, setHolding] = useState<"sign-in" | "sign-up" | null>(null);
  const hold = (screen: "sign-in" | "sign-up") => (busy: boolean) => setHolding(busy ? screen : null);

  // Until a kept sign-in is restored, show nothing rather than a sign-in screen that's about to vanish.
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void services.accounts.start();
    void services.ready.then(() => setReady(true));
    return services.onSignInChange(() => setSignedIn(services.auth.currentUser() !== null));
  }, [services]);

  // NF-3: a change the server refused is undone on the phone; a screen showing that record
  // reloads. Other screens are left alone, so nothing typed into them is lost.
  const [refusals, setRefusals] = useState(0);
  const shown = useRef(route);
  shown.current = route;
  useEffect(
    () =>
      services.onWriteRefused((change) => {
        if (shows(shown.current, change)) setRefusals((n) => n + 1);
      }),
    [services],
  );

  // NF-3: once signed in with signal, read everything in the account, and again whenever signal returns.
  // It waits a moment first, so on slow signal the screen the player opened comes first (NF-4).
  useEffect(() => {
    if (!ready || !signedIn || holding) return;
    const load = () => {
      if (navigator.onLine) {
        services.loadWholeAccount().catch((error: unknown) => console.warn("Couldn't read the whole account", error));
      }
    };
    const timer = setTimeout(load, LOAD_DELAY_MS);
    window.addEventListener("online", load);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("online", load);
    };
  }, [services, ready, signedIn, holding]);

  const inApp = ready && signedIn && holding === null;
  let screen;
  if (!ready) screen = <p className="center hint">Loading…</p>;
  else if (route?.screen === "privacy") screen = <Privacy signedIn={signedIn} />;
  else if (route?.screen === "help") screen = <Help page={route.page} />;
  else if (holding === "sign-up" || (!signedIn && route?.screen === "sign-up")) {
    screen = <SignUp accounts={services.accounts} onBusy={hold("sign-up")} />;
  } else if (holding === "sign-in" || !signedIn) {
    screen = <SignIn accounts={services.accounts} onBusy={hold("sign-in")} />;
  } else if (route?.screen === "account") screen = <Account services={services} />;
  else if (route?.screen === "titles") screen = <Titles services={services} />;
  else if (route?.screen === "new-character") screen = <NewCharacter services={services} />;
  else if (route?.screen === "character") screen = <CharacterPage key={route.id} services={services} id={route.id} />;
  else if (route?.screen === "category") {
    screen = <Category key={route.id + route.category} services={services} id={route.id} category={route.category} />;
  } else if (route?.screen === "entry") {
    screen = <EntryPage key={route.entryId} services={services} id={route.id} entryId={route.entryId} />;
  } else if (route?.screen === "skills") screen = <Skills key={route.id} services={services} id={route.id} />;
  else if (route?.screen === "history") screen = <History key={route.id} services={services} id={route.id} />;
  else if (route?.screen === "report")
    screen = <ReportForm key={route.kind ?? ""} services={services} kind={route.kind} />;
  else screen = <Characters services={services} />;

  return (
    <>
      <Header signedIn={inApp} help={helpFor(route, inApp)} />
      {inApp && <ConnectionBar store={services.store} />}
      {inApp && <RefusedNotices subscribe={services.onWriteRefused} />}
      <main className="page" key={refusals}>
        {screen}
      </main>
    </>
  );
}
