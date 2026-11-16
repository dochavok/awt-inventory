// Server side of reports to the maintainer (SP-2, SP-3), run by Cloud
// Functions. The issue tracker is a GitHub App installed only on the private
// reports repository; both it and the mailer are ports, faked in tests.

import { REPORT_KIND_NAMES, REPORTS_PER_DAY, type Report } from "../data/types";
import type { Clock } from "../platform/clock";
import { EMAIL_PATTERN, escapeRegExp } from "../platform/text";

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

/**
 * Replaces email addresses and the sender's display name (as a whole word, any
 * case) with a marker, so the issue never holds them (SP-2, PV-2).
 */
function scrubbed(text: string, displayName: string | undefined): string {
  let out = text.replace(EMAIL_PATTERN, "[email removed]");
  const name = displayName?.trim();
  if (name) {
    const whole = `(?<![\\p{L}\\p{N}_])${escapeRegExp(name)}(?![\\p{L}\\p{N}_])`;
    out = out.replace(new RegExp(whole, "giu"), "[name removed]");
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
      `Kind: ${report.kind} (${REPORT_KIND_NAMES[report.kind]})`,
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

// ---------------------------------------------------------------- the delivery queue

/** A report in the database: its sender and its ID. */
export interface ReportRef {
  uid: string;
  id: string;
}

/** SP-1: the reports the server has counted for a sender on one UTC day. */
export interface ReportCounter {
  day: string;
  ids: string[];
}

/** A report waiting for delivery. While leased, one run is delivering it and no other may. */
export interface QueueEntry {
  leaseUntil?: string;
}

/**
 * What the server keeps about reports: the reports themselves, the senders'
 * display names, a per-sender daily counter and a queue of reports to deliver.
 * Cloud Firestore in functions/; a fake in tests. The `update*` methods apply
 * `change` atomically and store its result.
 */
export interface DeliveryStore {
  /** The report, or undefined once it's gone (its account was deleted). */
  report(ref: ReportRef): Promise<Report | undefined>;
  displayName(uid: string): Promise<string | undefined>;
  saveDelivery(ref: ReportRef, result: Pick<Report, "delivery" | "issueNumber">): Promise<void>;
  updateCounter(uid: string, change: (counter: ReportCounter | undefined) => ReportCounter): Promise<ReportCounter>;
  /** `change` returns the new entry, or undefined to remove it; resolves to what `change` returned. */
  updateQueue(
    ref: ReportRef,
    change: (entry: QueueEntry | undefined) => QueueEntry | undefined,
  ): Promise<QueueEntry | undefined>;
  queued(): Promise<ReportRef[]>;
}

/** Everything the server needs to deliver reports. */
export interface ServerDelivery {
  issues: IssueTracker;
  mailer: Mailer;
  maintainerEmail: string;
  store: DeliveryStore;
  clock: Clock;
}

/** How long one run holds a report while delivering it. Another run may take it over after that. */
const LEASE_MS = 5 * 60_000;

/** The sender's counter for `day` with `id` counted, unless the day's limit is reached (SP-1). Counting twice changes nothing. */
function counted(counter: ReportCounter | undefined, id: string, day: string): ReportCounter {
  const ids = counter?.day === day ? counter.ids : [];
  if (ids.includes(id) || ids.length >= REPORTS_PER_DAY) return { day, ids };
  return { day, ids: [...ids, id] };
}

/**
 * A new report has reached the database (the server may be told more than
 * once): count it against its sender's UTC day (SP-1), then deliver it. A report
 * over the limit is kept, marked as not sent.
 */
export async function receiveReport(ref: ReportRef, server: ServerDelivery): Promise<void> {
  const { store, clock } = server;
  if ((await store.report(ref))?.delivery !== "pending") return;
  const day = clock.now().toISOString().slice(0, 10);
  const counter = await store.updateCounter(ref.uid, (c) => counted(c, ref.id, day));
  if (!counter.ids.includes(ref.id)) {
    await store.saveDelivery(ref, { delivery: "not-sent" });
    return;
  }
  await store.updateQueue(ref, (entry) => entry ?? {});
  await deliverQueued(ref, server);
}

/**
 * Delivers one queued report, unless another run is delivering it. One that
 * can't be delivered stays queued for the retry (SP-2).
 */
export async function deliverQueued(ref: ReportRef, server: ServerDelivery): Promise<void> {
  const { store, clock } = server;
  const now = clock.now();
  let mine = false;
  await store.updateQueue(ref, (entry) => {
    // A transaction may run this more than once: only its last run counts.
    mine = entry !== undefined && !(entry.leaseUntil && entry.leaseUntil > now.toISOString());
    return mine ? { leaseUntil: new Date(now.getTime() + LEASE_MS).toISOString() } : entry;
  });
  if (!mine) return;
  const report = await store.report(ref);
  if (report?.delivery === "pending") {
    const done = await deliverReport(report, {
      issues: server.issues,
      mailer: server.mailer,
      maintainerEmail: server.maintainerEmail,
      displayNameOf: (uid) => store.displayName(uid),
    });
    if (done.delivery === "pending") return;
    await store.saveDelivery(
      ref,
      done.issueNumber === undefined
        ? { delivery: done.delivery }
        : { delivery: done.delivery, issueNumber: done.issueNumber },
    );
  }
  await store.updateQueue(ref, () => undefined);
}

/** The regular retry (SP-2): tries every report still waiting. One that fails doesn't stop the rest. */
export async function retryQueued(server: ServerDelivery): Promise<void> {
  const failures: unknown[] = [];
  for (const ref of await server.store.queued()) {
    try {
      await deliverQueued(ref, server);
    } catch (e) {
      failures.push(e);
    }
  }
  if (failures.length > 0) throw new AggregateError(failures, `${failures.length} queued reports failed`);
}
