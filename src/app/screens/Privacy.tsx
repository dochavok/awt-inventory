// PV-4: what the app stores, who can see it, and how to delete it. Linked from
// sign-up and from the account page.

import { href } from "../router";

export function Privacy({ signedIn }: { signedIn: boolean }) {
  return (
    <>
      <h1>Privacy</h1>
      <section aria-labelledby="stored-title">
        <h2 id="stored-title">What the app stores</h2>
        <ul>
          <li>How you sign in: your email address, or your Google account.</li>
          <li>The display name you choose. No real name is asked for.</li>
          <li>Your game records: characters, inventory, skills, titles and history.</li>
        </ul>
        <p>Nothing else.</p>
      </section>
      <section aria-labelledby="who-title">
        <h2 id="who-title">Who can see it</h2>
        <p>
          Only you. Your records can be read and changed only by you, and the server enforces this, not just the
          screens.
        </p>
        <p>
          When trading arrives, an entry you choose to list for trade will show its name, category, description, rarity,
          item family and quantity, with your display name, to other players. Never your notes, your character&apos;s
          name or your history.
        </p>
        <p>
          The maintainer has no screens for browsing anyone&apos;s data, and looks at stored data through the hosting
          provider&apos;s console only for support you&apos;ve asked for.
        </p>
      </section>
      <section aria-labelledby="delete-title">
        <h2 id="delete-title">Deleting it</h2>
        <p>
          You can delete your account at any time from your account page. That removes every character, entry, title and
          history record in it, and your sign-in, permanently.
        </p>
      </section>
      <p>
        <a href={href(signedIn ? "account" : "sign-up")}>{signedIn ? "Back to your account" : "Back to sign-up"}</a>
      </p>
    </>
  );
}
