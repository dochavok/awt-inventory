// Server side of reports to the maintainer (SP-2, SP-3), run by Cloud
// Functions. The issue tracker is a GitHub App installed only on the private
// reports repository; both it and the mailer are ports, faked in tests.
// M1 stub.

import type { Report } from "../data/types";
import { NotImplementedError } from "../errors";

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
}

/** Delivers one report: an issue, or for an account problem an email. Leaves it pending if delivery fails. */
export function deliverReport(_report: Report, _delivery: ReportDelivery): Promise<Report> {
  return Promise.reject(NotImplementedError.stub("deliverReport", "M3"));
}

/** Retries every pending report (SP-2: never lost). */
export function deliverPending(_reports: Report[], _delivery: ReportDelivery): Promise<Report[]> {
  return Promise.reject(NotImplementedError.stub("deliverPending", "M3"));
}
