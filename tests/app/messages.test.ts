// What the app tells the user when something is refused or fails, and which of
// those are reported to the maintainer (NF-12).

import { expect } from "vitest";
import { isExplainedRefusal, messageFor } from "../../src/app/messages";
import { RateLimitError } from "../../src/errors";
import { rule } from "../support/rule";

const firebaseError = (code: string) => Object.assign(new Error(`Firebase: Error (${code}).`), { code });

rule(
  { req: ["NF-12"], m: "M3" },
  "sign-in refusals the app explains aren't errors to report; anything it can't explain is",
  () => {
    for (const refusal of [
      firebaseError("auth/wrong-password"),
      firebaseError("auth/email-already-in-use"),
      new RateLimitError(5, "You can send 5 reports a day. Try again tomorrow."),
    ]) {
      expect(isExplainedRefusal(refusal), `${refusal.message} explained`).toBe(true);
      expect(messageFor(refusal), `the message for ${refusal.message}`).not.toBe(
        "Something went wrong. Please try again.",
      );
    }
    for (const failure of [firebaseError("auth/internal-error"), firebaseError("unavailable"), new TypeError("x")]) {
      expect(isExplainedRefusal(failure), `${failure.message} explained`).toBe(false);
      expect(messageFor(failure), `the message for ${failure.message}`).toBe("Something went wrong. Please try again.");
    }
  },
);
