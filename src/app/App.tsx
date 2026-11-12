// The app shell: which screen shows, from the address and whether someone is
// signed in. Sign-ins last until the user signs out (AC-3). With signal, the
// whole account is read once signed in, so all of it stays on the phone (NF-3).

import { useEffect, useState } from "react";
import { useRoute } from "./router";
import type { Services } from "./services";
import { ConnectionBar, Header, RefusedNotices } from "./Shell";
import { Account } from "./screens/Account";
import { CharacterPage, Characters, NewCharacter } from "./screens/Characters";
import { Help, helpFor } from "./screens/Help";
import { Privacy } from "./screens/Privacy";
import { SignIn } from "./screens/SignIn";
import { SignUp } from "./screens/SignUp";
import { Titles } from "./screens/Titles";

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

  // NF-3: once signed in with signal, read everything in the account, and again whenever signal returns.
  useEffect(() => {
    if (!ready || !signedIn || holding) return;
    const load = () => {
      if (navigator.onLine) {
        services.loadWholeAccount().catch((error: unknown) => console.warn("Couldn't read the whole account", error));
      }
    };
    load();
    window.addEventListener("online", load);
    return () => window.removeEventListener("online", load);
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
  else screen = <Characters services={services} />;

  return (
    <>
      <Header
        signedIn={inApp}
        help={helpFor(inApp || route?.screen === "help" || route?.screen === "privacy" ? route : null)}
      />
      {inApp && <ConnectionBar store={services.store} />}
      {inApp && <RefusedNotices subscribe={services.onWriteRefused} />}
      <main className="page">{screen}</main>
    </>
  );
}
