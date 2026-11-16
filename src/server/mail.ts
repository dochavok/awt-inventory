// SP-3: account-problem emails to the maintainer, through Resend's free plan.
// With no domain of our own, Resend sends from its shared address and only to
// the address the Resend account was made with: the maintainer's.

import { NotImplementedError } from "../errors";
import type { Mailer } from "./reports";

export const RESEND_SENDER = "AWT Inventory <onboarding@resend.dev>";

/** A mailer that sends through Resend; `apiKey` comes from the secret store. */
export function resendMailer(_apiKey: string, _deps: { fetch: typeof fetch }): Mailer {
  throw NotImplementedError.stub("resendMailer", "M3");
}
