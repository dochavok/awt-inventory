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

/**
 * Replaces email addresses and the sender's display name (as a whole word, any
 * case) with a marker, so the issue never holds them (SP-2, PV-2).
 */
function scrubbed(text: string, displayName: string | undefined): string {
  let out = text.replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "[email removed]");
  const name = displayName?.trim();
  if (name) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(`(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`, "giu"), "[name removed]");
  }
  return out;
}

/**
 * The issue for a report (SP-2): subject, message, kind, app version and report
 * number, with the sender's email address and display name replaced by a
 * marker. It points to the full report, as sent, in the database.
 */
function issueFor(report: Report, displayName: string | undefined): { title: string; body: string; labels: string[] } {
  return {
    title: scrubbed(report.subject, displayName),
    body: [
      scrubbed(report.message, displayName),
      "",
      "---",
      `Kind: ${report.kind} (${KIND_NAMES[report.kind]})`,
      `App version: ${report.appVersion}`,
      `Report number: ${report.number}`,
      `Email addresses and the sender's name are removed here. The full report, as sent, is in the app's database under report number ${report.number}.`,
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
    // If the name can't be looked up, the catch below leaves the report pending
    // rather than send it unscrubbed.
    const displayName = await delivery.displayNameOf?.(report.uid);
    const issue = await delivery.issues.createIssue(issueFor(report, displayName));
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
