// Server side of reports to the maintainer (SP-2, SP-3), run by Cloud
// Functions. The issue tracker is a GitHub App installed only on the private
// reports repository; both it and the mailer are ports, faked in tests.

import type { Report, ReportKind } from "../data/types";

export interface IssueTracker {
  createIssue(issue: { title: string; body: string; labels: string[] }): Promise<{ number: number }>;
}

export interface Mailer {
  send(message: { to: string; subject: string; text: string }): Promise<void>;
}

export interface ReportDelivery {
  issues: IssueTracker;
  mailer: Mailer;
  maintainerEmail: string;
  /** The user's display name, so the issue can leave it out (SP-2). */
  displayNameOf?: (uid: string) => Promise<string | undefined>;
}

const KIND_NAMES: Record<ReportKind, string> = {
  "missing-skill": "Missing or wrong skill",
  bug: "Bug",
  idea: "Idea",
  "account-problem": "Account problem",
};

/** Removes email addresses the user typed, so the issue never holds one (SP-2, PV-2). */
function withoutEmails(text: string): string {
  return text.replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "[email removed]");
}

/**
 * The issue for a report (SP-2): subject, message, kind, app version and report
 * number. Never the sender's email address or display name: the report carries
 * neither, and emails the user typed are removed.
 */
export function issueFor(report: Report): { title: string; body: string; labels: string[] } {
  return {
    title: withoutEmails(report.subject),
    body: [
      withoutEmails(report.message),
      "",
      "---",
      `Kind: ${report.kind} (${KIND_NAMES[report.kind]})`,
      `App version: ${report.appVersion}`,
      `Report number: ${report.number}`,
    ].join("\n"),
    labels: [report.kind],
  };
}

/** Delivers one report: an issue, or for an account problem an email. Leaves it pending if delivery fails. */
export async function deliverReport(report: Report, delivery: ReportDelivery): Promise<Report> {
  if (report.delivery !== "pending") return report;
  try {
    if (report.kind === "account-problem") {
      // SP-3: only the report number leaves the database.
      await delivery.mailer.send({
        to: delivery.maintainerEmail,
        subject: `AWT Inventory: account problem report ${report.number}`,
        text: `A player sent an account problem report, number ${report.number}. Read it in the database console.`,
      });
      return { ...report, delivery: "emailed" };
    }
    const issue = await delivery.issues.createIssue(issueFor(report));
    return { ...report, delivery: "issue-created", issueNumber: issue.number };
  } catch {
    // SP-2: GitHub (or the mail service) can't be reached; the report waits for the next try.
    return report;
  }
}

/** Retries every pending report (SP-2: never lost). */
export async function deliverPending(reports: Report[], delivery: ReportDelivery): Promise<Report[]> {
  const out: Report[] = [];
  for (const report of reports) out.push(await deliverReport(report, delivery));
  return out;
}
