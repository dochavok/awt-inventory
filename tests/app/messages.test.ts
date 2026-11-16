// What the app tells the user when something is refused or fails, and which of
// those are reported to the maintainer (NF-12).

import { expect } from "vitest";
import { isExplainedRefusal, messageFor } from "../../src/app/messages";
import { RateLimitError } from "../../src/errors";
import { rule } from "../support/rule";
import { isReportable } from "../../src/app/messages";
import { ValidationError } from "../../src/errors";
import { errorReportFilter } from "../../src/platform/error-reports";

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

rule(
  { req: ["NF-12"], m: "M3" },
  "the app's error filter sends real errors and drops every refusal it explains",
  () => {
    const known = { displayName: "Bramblewick", email: "bram@example.test" };
    const beforeSend = errorReportFilter(() => known, isReportable);
    const event = { exception: { values: [{ type: "TypeError", value: "x is undefined for Bramblewick" }] } };
    const sent = beforeSend(event, { originalException: new TypeError("x is undefined for Bramblewick") });
    expect(sent?.exception?.values?.[0]?.value, "a real error, scrubbed").toBe("x is undefined for [name]");
    for (const refusal of [
      firebaseError("auth/wrong-password"),
      new ValidationError("name", "You already have a character named Aldric."),
    ]) {
      expect(beforeSend(event, { originalException: refusal }), `${refusal.message} sent`).toBeNull();
    }
  },
);
