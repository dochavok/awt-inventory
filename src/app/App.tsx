// The app shell: which screen shows, from the address and whether someone is
// signed in. Sign-ins last until the user signs out (AC-3).

import { useEffect, useState } from "react";
import { useRoute } from "./router";
import type { Services } from "./services";
import { Account } from "./screens/Account";
import { Privacy } from "./screens/Privacy";
import { SignIn } from "./screens/SignIn";
import { SignUp } from "./screens/SignUp";

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

  let screen;
  if (!ready) screen = <p className="center hint">Loading…</p>;
  else if (route === "privacy") screen = <Privacy signedIn={signedIn} />;
  else if (holding === "sign-up" || (!signedIn && route === "sign-up")) {
    screen = <SignUp accounts={services.accounts} onBusy={hold("sign-up")} />;
  } else if (holding === "sign-in" || !signedIn) {
    screen = <SignIn accounts={services.accounts} onBusy={hold("sign-in")} />;
  } else screen = <Account services={services} />;

  return (
    <>
      <header className="app-header">
        <span className="app-name">AWT Inventory</span>
      </header>
      <main className="page">{screen}</main>
    </>
  );
}
