// SP-3: account-problem emails to the maintainer, through Resend's free plan.
// With no domain of our own, Resend sends from its shared address and only to
// the address the Resend account was made with: the maintainer's.

import type { Mailer } from "./reports";

export const RESEND_SENDER = "AWT Inventory <onboarding@resend.dev>";

/** A mailer that sends through Resend; `apiKey` comes from the secret store. */
export function resendMailer(apiKey: string, deps: { fetch: typeof fetch }): Mailer {
  return {
    async send(message) {
      const response = await deps.fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          // Resend refuses requests without one.
          "User-Agent": "awt-inventory",
        },
        body: JSON.stringify({ from: RESEND_SENDER, to: [message.to], subject: message.subject, text: message.text }),
      });
      if (!response.ok) throw new Error(`Resend refused the email: ${response.status}`);
    },
  };
}
