// AC-4: the terms of use, in plain language, accepted at sign-up. The text is
// the guide's page, docs/terms-of-use.md.

import { DocBody, helpPage } from "./Help";

export function Terms() {
  return (
    <section className="card terms" aria-labelledby="terms-title">
      <h2 id="terms-title">Terms of use</h2>
      <DocBody html={helpPage("terms-of-use")?.html ?? ""} />
    </section>
  );
}
