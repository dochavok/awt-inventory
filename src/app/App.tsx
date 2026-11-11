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
  // Sign-up signs in before the profile exists, so its screen stays until it finishes or fails.
  const [signingUp, setSigningUp] = useState(false);

  useEffect(() => {
    void services.accounts.start();
    return services.onSignInChange(() => setSignedIn(services.auth.currentUser() !== null));
  }, [services]);

  let screen;
  if (route === "privacy") screen = <Privacy signedIn={signedIn} />;
  else if (signingUp || (!signedIn && route === "sign-up")) {
    screen = <SignUp accounts={services.accounts} onSigningUp={setSigningUp} />;
  } else if (signedIn) screen = <Account services={services} />;
  else screen = <SignIn accounts={services.accounts} />;

  return (
    <>
      <header className="app-header">
        <span className="app-name">AWT Inventory</span>
      </header>
      <main className="page">{screen}</main>
    </>
  );
}
