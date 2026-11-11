// Delivering reports (SP-2, SP-3): an issue in the private reports repository,
// or for an account problem an email with only the report number. The issue
// tracker and mailer are fakes; nothing reaches GitHub or a mail server.

import { expect } from "vitest";
import type { Report } from "../../src/data/types";
import { deliverPending, deliverReport, type IssueTracker, type Mailer } from "../../src/server/reports";
import { rule } from "../support/rule";

class FakeIssues implements IssueTracker {
  readonly created: { title: string; body: string; labels: string[] }[] = [];
  down = false;
  async createIssue(issue: { title: string; body: string; labels: string[] }) {
    if (this.down) throw new Error("GitHub unreachable (fake)");
    this.created.push(issue);
    return { number: 100 + this.created.length };
  }
}

class FakeMailer implements Mailer {
  readonly sent: { to: string; subject: string; text: string }[] = [];
  async send(message: { to: string; subject: string; text: string }) {
    this.sent.push(message);
  }
}

function report(overrides: Partial<Report> = {}): Report {
  return {
    id: "r1",
    number: 42,
    uid: "uid-bram",
    kind: "bug",
    subject: "CM looks wrong",
    message: "Aldric's CM showed 169. Bramblewick, bram@example.test",
    sentAt: "2026-06-13T15:00:00.000Z",
    appVersion: "0.3.0",
    delivery: "pending",
    ...overrides,
  };
}

function delivery() {
  const issues = new FakeIssues();
  const mailer = new FakeMailer();
  return { issues, mailer, deps: { issues, mailer, maintainerEmail: "maintainer@example.test" } };
}

rule(
  { req: ["SP-2"], m: "M3" },
  "a bug report becomes an issue labelled bug, with the subject, message, kind, version and number",
  async () => {
    const { issues, mailer, deps } = delivery();
    const done = await deliverReport(report({ message: "The made-up total looked wrong." }), deps);
    expect(issues.created.length, "issues created").toBe(1);
    const issue = issues.created[0]!;
    expect(issue.labels, "the issue's labels").toEqual(["bug"]);
    expect(issue.title, "the issue's title").toContain("CM looks wrong");
    for (const part of ["The made-up total looked wrong.", "bug", "0.3.0", "42"]) {
      expect(issue.body, `the issue body including ${part}`).toContain(part);
    }
    expect(done, "the report after delivery").toMatchObject({ delivery: "issue-created", issueNumber: 101 });
    expect(mailer.sent, "emails sent").toEqual([]);
  },
);

rule({ req: ["SP-2"], m: "M3" }, "each kind except account problems gets its own label", async () => {
  const { issues, deps } = delivery();
  for (const kind of ["missing-skill", "idea"] as const) await deliverReport(report({ kind }), deps);
  expect(
    issues.created.map((i) => i.labels),
    "labels",
  ).toEqual([["missing-skill"], ["idea"]]);
});

rule(
  { req: ["SP-2", "PV-2"], m: "M3" },
  "an issue never holds the sender's email address or display name, even if the user typed them",
  async () => {
    const { issues, deps } = delivery();
    const displayNameOf = async (uid: string) => (uid === "uid-bram" ? "Bramblewick" : undefined);
    await deliverReport(report(), { ...deps, displayNameOf });
    expect(issues.created.length, "issues created").toBe(1);
    const issue = JSON.stringify(issues.created);
    expect(issue, "the issue").not.toContain("bram@example.test");
    expect(issue, "the issue").not.toContain("Bramblewick");
    expect(issues.created[0]!.body, "the rest of the message").toContain("Aldric's CM showed 169.");
    expect(issues.created[0]!.body, "the pointer to the full report").toMatch(/full report[^\n]*42/);
  },
);

rule(
  { req: ["SP-2"], m: "M3" },
  "if GitHub can't be reached, the report stays pending and is delivered later",
  async () => {
    const { issues, deps } = delivery();
    issues.down = true;
    const first = await deliverReport(report(), deps);
    expect(first.delivery, "the report while GitHub is down").toBe("pending");
    issues.down = false;
    const [later] = await deliverPending([first], deps);
    expect(later?.delivery, "the report once GitHub is back").toBe("issue-created");
    expect(issues.created.length, "issues created").toBe(1);
  },
);

rule(
  { req: ["SP-2"], m: "M3" },
  "delivering pending reports skips ones already delivered, so no issue is made twice",
  async () => {
    const { issues, deps } = delivery();
    const done = await deliverReport(report(), deps);
    await deliverPending([done], deps);
    expect(issues.created.length, "issues created").toBe(1);
  },
);

rule(
  { req: ["SP-3"], m: "M3" },
  "an account problem isn't sent to GitHub; the maintainer gets an email with only the report number",
  async () => {
    const { issues, mailer, deps } = delivery();
    const done = await deliverReport(
      report({ kind: "account-problem", subject: "Can't sign in", message: "My email is bram@example.test" }),
      deps,
    );
    expect(issues.created, "issues created").toEqual([]);
    expect(mailer.sent.length, "emails sent").toBe(1);
    const email = mailer.sent[0]!;
    expect(email.to, "who the email goes to").toBe("maintainer@example.test");
    expect(`${email.subject} ${email.text}`, "the email").toContain("42");
    for (const secret of ["Can't sign in", "bram@example.test", "Bramblewick", "uid-bram"]) {
      expect(`${email.subject} ${email.text}`, `the email including ${secret}`).not.toContain(secret);
    }
    expect(done.delivery, "the report after delivery").toBe("emailed");
  },
);
