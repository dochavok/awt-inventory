// PV-4: what the app stores, who can see it, and how to delete it. Linked from
// sign-up and from the account page. The text is the guide's page, docs/privacy.md.

import { href } from "../router";
import { DocBody, helpPage } from "./Help";

export function Privacy({ signedIn }: { signedIn: boolean }) {
  return (
    <>
      <h1>Privacy</h1>
      <DocBody html={helpPage("privacy")?.html ?? ""} />
      <p>
        <a href={href(signedIn ? "account" : "sign-up")}>{signedIn ? "Back to your account" : "Back to sign-up"}</a>
      </p>
    </>
  );
}
