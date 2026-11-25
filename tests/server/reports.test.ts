// Delivering reports (SP-2, SP-3): an issue in the private reports repository,
// or for an account problem an email with only the report number. The issue
// tracker and mailer are fakes; nothing reaches GitHub or a mail server.

import { expect } from "vitest";
import type { Report } from "../../src/data/types";
import { deliverPending, deliverReport, type IssueTracker, type Mailer } from "../../src/server/reports";
import { rule } from "../support/rule";
import { createPublicKey, createVerify, generateKeyPairSync } from "node:crypto";
import { gitHubIssues } from "../../src/server/github";
import { resendMailer } from "../../src/server/mail";
import {
  deliverQueued,
  receiveReport,
  retryQueued,
  type DeliveryStore,
  type QueueEntry,
  type ReportCounter,
  type ReportRef,
  type ServerDelivery,
} from "../../src/server/reports";
import { FakeClock } from "../support/fake-clock";
import { counterExpiry } from "../../src/server/reports";

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
  { req: ["SP-2", "PV-2"], m: "M3" },
  "the sender's display name is removed from the issue's title too, however it's capitalised",
  async () => {
    const { issues, deps } = delivery();
    const displayNameOf = async (uid: string) => (uid === "uid-bram" ? "Bramblewick" : undefined);
    await deliverReport(report({ subject: "bramblewick: CM looks wrong", message: "Signed, BRAMBLEWICK." }), {
      ...deps,
      displayNameOf,
    });
    expect(issues.created.length, "issues created").toBe(1);
    const issue = issues.created[0]!;
    expect(issue.title.toLowerCase(), "the issue's title").not.toContain("bramblewick");
    expect(issue.title, "the rest of the issue's title").toContain("CM looks wrong");
    expect(issue.body.toLowerCase(), "the issue's body").not.toContain("bramblewick");
  },
);

rule(
  { req: ["SP-2", "PV-2"], m: "M3" },
  "if the sender's display name can't be looked up, no issue is made and the report stays pending",
  async () => {
    const { issues, deps } = delivery();
    const displayNameOf = async () => {
      throw new Error("database unreachable (fake)");
    };
    const done = await deliverReport(report(), { ...deps, displayNameOf });
    expect(issues.created, "issues created").toEqual([]);
    expect(done.delivery, "the report after the failed lookup").toBe("pending");
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

// ---------------------------------------------------------------- the server's delivery (SP-1 to SP-3)

/** The server's records in memory. Each method's body runs in one go, as a transaction would. */
class FakeDeliveryStore implements DeliveryStore {
  readonly reports = new Map<string, Report>();
  readonly names = new Map<string, string>();
  readonly counters = new Map<string, ReportCounter>();
  readonly queue = new Map<string, QueueEntry>();
  nameLookupFails = false;

  add(r: Report): ReportRef {
    this.reports.set(`${r.uid}/${r.id}`, r);
    return { uid: r.uid, id: r.id };
  }
  delivery(ref: ReportRef): Report["delivery"] | undefined {
    return this.reports.get(`${ref.uid}/${ref.id}`)?.delivery;
  }
  async report(ref: ReportRef) {
    const r = this.reports.get(`${ref.uid}/${ref.id}`);
    return r && { ...r };
  }
  async displayName(uid: string) {
    if (this.nameLookupFails) throw new Error("database unreachable (fake)");
    return this.names.get(uid);
  }
  async saveDelivery(ref: ReportRef, result: Pick<Report, "delivery" | "issueNumber">) {
    const r = this.reports.get(`${ref.uid}/${ref.id}`);
    if (r) this.reports.set(`${ref.uid}/${ref.id}`, { ...r, ...result });
  }
  async updateCounter(uid: string, change: (counter: ReportCounter | undefined) => ReportCounter) {
    const before = this.counters.get(uid);
    const next = change(before && { day: before.day, ids: [...before.ids] });
    this.counters.set(uid, next);
    return next;
  }
  async updateQueue(ref: ReportRef, change: (entry: QueueEntry | undefined) => QueueEntry | undefined) {
    const key = `${ref.uid}/${ref.id}`;
    const before = this.queue.get(key);
    const next = change(before && { ...before });
    if (next === undefined) this.queue.delete(key);
    else this.queue.set(key, next);
    return next;
  }
  async queued() {
    return [...this.queue.keys()].map((key) => {
      const [uid, id] = key.split("/") as [string, string];
      return { uid, id };
    });
  }
}

function server() {
  const issues = new FakeIssues();
  const mailer = new FakeMailer();
  const store = new FakeDeliveryStore();
  const clock = new FakeClock();
  const deps: ServerDelivery = { issues, mailer, maintainerEmail: "maintainer@example.test", store, clock };
  return { issues, mailer, store, clock, deps };
}

rule(
  { req: ["SP-1"], m: "M3" },
  "the server passes on at most 15 of a sender's reports a day; the rest are kept but not sent",
  async () => {
    const { issues, mailer, store, clock, deps } = server();
    const numbers = Array.from({ length: 17 }, (_, i) => i + 1);
    const bram = numbers.map((n) =>
      store.add(
        report({ id: `r${n}`, number: n, kind: n === 5 ? "account-problem" : "bug", message: `Made-up bug ${n}` }),
      ),
    );
    const cass = store.add(report({ id: "c1", number: 50, uid: "uid-cass", message: "Cass's made-up bug" }));
    for (const ref of [...bram, cass]) await receiveReport(ref, deps);

    expect(
      bram.map((ref) => store.delivery(ref)),
      "Bram's 17 reports, in order",
    ).toEqual(numbers.map((n) => (n > 15 ? "not-sent" : n === 5 ? "emailed" : "issue-created")));
    expect(store.delivery(cass), "Cass's report, the same day").toBe("issue-created");
    expect(
      issues.created.map((i) => i.body.split("\n")[0]),
      "issues created",
    ).toEqual([...numbers.filter((n) => n <= 15 && n !== 5).map((n) => `Made-up bug ${n}`), "Cass's made-up bug"]);
    expect(mailer.sent.length, "emails sent").toBe(1);
    expect(await store.queued(), "reports still waiting").toEqual([]);

    clock.advanceDays(1);
    const next = store.add(report({ id: "r18", number: 18, message: "The next day's made-up bug" }));
    await receiveReport(next, deps);
    expect(store.delivery(next), "Bram's first report the next day").toBe("issue-created");
    expect(issues.created.length, "issues created by the next day").toBe(16);
  },
);

rule(
  { req: ["SP-1", "SP-2"], m: "M3" },
  "a report the server is told about twice is counted once and delivered once",
  async () => {
    const { issues, store, deps } = server();
    const refs = Array.from({ length: 16 }, (_, i) => store.add(report({ id: `r${i + 1}`, number: i + 1 })));
    await Promise.all([receiveReport(refs[0]!, deps), receiveReport(refs[0]!, deps)]);
    await receiveReport(refs[0]!, deps);
    expect(issues.created.length, "issues for the report told about three times").toBe(1);
    for (const ref of refs.slice(1)) await receiveReport(ref, deps);
    expect(
      refs.map((ref) => store.delivery(ref)),
      "Bram's 16 reports, in order",
    ).toEqual([...Array(15).fill("issue-created"), "not-sent"]);
    expect(issues.created.length, "issues created").toBe(15);
  },
);

rule(
  { req: ["SP-2"], m: "M3" },
  "a report GitHub couldn't take is delivered by the next retry, and only once",
  async () => {
    const { issues, store, clock, deps } = server();
    const ref = store.add(report());
    issues.down = true;
    await receiveReport(ref, deps);
    expect(store.delivery(ref), "the report while GitHub is down").toBe("pending");
    expect(await store.queued(), "reports waiting while GitHub is down").toEqual([ref]);

    clock.advance(60 * 60_000);
    issues.down = false;
    await retryQueued(deps);
    expect(store.delivery(ref), "the report after the retry").toBe("issue-created");
    expect(store.reports.get("uid-bram/r1")?.issueNumber, "the report's issue number").toBe(101);
    expect(await store.queued(), "reports waiting after the retry").toEqual([]);
    await retryQueued(deps);
    expect(issues.created.length, "issues created after a second retry").toBe(1);
  },
);

rule(
  { req: ["SP-2"], m: "M3" },
  "a report one run is delivering isn't delivered again by another run at the same time",
  async () => {
    const { issues, store, clock, deps } = server();
    const ref = store.add(report());
    issues.down = true;
    await receiveReport(ref, deps);
    clock.advance(60 * 60_000);
    issues.down = false;
    await Promise.all([deliverQueued(ref, deps), deliverQueued(ref, deps), retryQueued(deps)]);
    expect(issues.created.length, "issues created by three runs at once").toBe(1);
    expect(store.delivery(ref), "the report").toBe("issue-created");
  },
);

rule(
  { req: ["SP-2", "PV-2"], m: "M3" },
  "the server looks up the sender's display name and leaves it out of the issue",
  async () => {
    const { issues, store, deps } = server();
    store.names.set("uid-bram", "Bramblewick");
    store.names.set("uid-cass", "Cassandra");
    await receiveReport(store.add(report()), deps);
    expect(issues.created.length, "issues created").toBe(1);
    expect(JSON.stringify(issues.created[0]), "the issue").not.toContain("Bramblewick");
    expect(issues.created[0]!.body, "the rest of the message").toContain("Aldric's CM showed 169.");
  },
);

rule(
  { req: ["SP-2", "PV-2"], m: "M3" },
  "if the server can't look up the sender's display name, the report waits for the retry",
  async () => {
    const { issues, store, clock, deps } = server();
    const ref = store.add(report());
    store.nameLookupFails = true;
    await receiveReport(ref, deps);
    expect(issues.created, "issues created while the lookup fails").toEqual([]);
    expect(store.delivery(ref), "the report").toBe("pending");
    expect(await store.queued(), "reports waiting").toEqual([ref]);
    store.nameLookupFails = false;
    clock.advance(60 * 60_000);
    await retryQueued(deps);
    expect(store.delivery(ref), "the report after the retry").toBe("issue-created");
  },
);

rule(
  { req: ["SP-2", "AC-5"], m: "M3" },
  "a waiting report whose account was deleted is dropped, not sent",
  async () => {
    const { issues, store, clock, deps } = server();
    const ref = store.add(report());
    issues.down = true;
    await receiveReport(ref, deps);
    store.reports.delete("uid-bram/r1");
    issues.down = false;
    clock.advance(60 * 60_000);
    await retryQueued(deps);
    expect(issues.created, "issues created").toEqual([]);
    expect(await store.queued(), "reports waiting").toEqual([]);
  },
);

// ---------------------------------------------------------------- GitHub and Resend, with a fake fetch

interface Sent {
  method: string;
  url: string;
  headers: Headers;
  body: string;
}

function fakeFetch(reply: (url: string) => { status: number; json: unknown }) {
  const sent: Sent[] = [];
  const fetcher = async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    sent.push({
      method: init?.method ?? "GET",
      url,
      headers: new Headers(init?.headers),
      body: typeof init?.body === "string" ? init.body : "",
    });
    const { status, json } = reply(url);
    return new Response(JSON.stringify(json), { status, headers: { "content-type": "application/json" } });
  };
  return { sent, fetch: fetcher as typeof fetch };
}

function rsaKeys() {
  return generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  });
}

const fromBase64Url = (part: string) => Buffer.from(part, "base64url");

rule(
  { req: ["SP-2"], m: "M3" },
  "issues are created in the private reports repository, signed in as the reports GitHub App",
  async () => {
    const { privateKey, publicKey } = rsaKeys();
    const now = new Date("2026-06-13T15:00:00.000Z");
    const github = fakeFetch((url) =>
      url.endsWith("/access_tokens")
        ? { status: 201, json: { token: "made-up-installation-token" } }
        : { status: 201, json: { number: 7 } },
    );
    const issue = await gitHubIssues(privateKey, { fetch: github.fetch, now: () => now }).createIssue({
      title: "CM looks wrong",
      body: "The made-up total looked wrong.",
      labels: ["bug"],
    });
    expect(issue.number, "the new issue's number").toBe(7);
    expect(
      github.sent.map((r) => `${r.method} ${r.url}`),
      "requests to GitHub",
    ).toEqual([
      "POST https://api.github.com/app/installations/181702223/access_tokens",
      "POST https://api.github.com/repos/dochavok/awt-inventory-reports/issues",
    ]);

    const [signIn, create] = github.sent as [Sent, Sent];
    const jwt = /^Bearer (.+)$/.exec(signIn.headers.get("authorization") ?? "")?.[1] ?? "";
    const [header, payload, signature] = jwt.split(".") as [string, string, string];
    expect(JSON.parse(fromBase64Url(header).toString()), "the app token's header").toMatchObject({ alg: "RS256" });
    const claims = JSON.parse(fromBase64Url(payload).toString()) as { iss: unknown; iat: number; exp: number };
    expect(String(claims.iss), "the app token's issuer, the App ID").toBe("5749200");
    const seconds = now.getTime() / 1000;
    expect(claims.iat, "the app token's start").toBeLessThanOrEqual(seconds);
    expect(claims.exp, "the app token's end").toBeGreaterThan(seconds);
    expect(claims.exp - claims.iat, "the app token's lifetime, at most GitHub's 10 minutes").toBeLessThanOrEqual(600);
    const verified = createVerify("RSA-SHA256")
      .update(`${header}.${payload}`)
      .verify(createPublicKey(publicKey), fromBase64Url(signature));
    expect(verified, "the app token signed with the App's private key").toBe(true);

    expect(create.headers.get("authorization"), "the issue request's token").toMatch(
      /^(Bearer|token) made-up-installation-token$/,
    );
    expect(JSON.parse(create.body), "the issue").toEqual({
      title: "CM looks wrong",
      body: "The made-up total looked wrong.",
      labels: ["bug"],
    });
  },
);

rule({ req: ["SP-2"], m: "M3" }, "if GitHub refuses the App or the issue, the report waits", async () => {
  const { privateKey } = rsaKeys();
  const mailer = new FakeMailer();
  const refused = fakeFetch(() => ({ status: 401, json: { message: "Bad credentials" } }));
  const first = await deliverReport(report(), {
    issues: gitHubIssues(privateKey, { fetch: refused.fetch, now: () => new Date() }),
    mailer,
    maintainerEmail: "maintainer@example.test",
  });
  expect(first.delivery, "the report when the App is refused").toBe("pending");
  expect(refused.sent.length, "requests after the App was refused").toBe(1);

  const failing = fakeFetch((url) =>
    url.endsWith("/access_tokens")
      ? { status: 201, json: { token: "made-up-installation-token" } }
      : { status: 502, json: { message: "Server Error" } },
  );
  const second = await deliverReport(report(), {
    issues: gitHubIssues(privateKey, { fetch: failing.fetch, now: () => new Date() }),
    mailer,
    maintainerEmail: "maintainer@example.test",
  });
  expect(second.delivery, "the report when the issue fails").toBe("pending");
});

rule(
  { req: ["SP-3"], m: "M3" },
  "an account-problem email goes through Resend, from its shared address to the maintainer only",
  async () => {
    const resend = fakeFetch(() => ({ status: 200, json: { id: "made-up-email-id" } }));
    const done = await deliverReport(report({ kind: "account-problem" }), {
      issues: new FakeIssues(),
      mailer: resendMailer("made-up-resend-key", { fetch: resend.fetch }),
      maintainerEmail: "maintainer@example.test",
    });
    expect(done.delivery, "the report").toBe("emailed");
    expect(
      resend.sent.map((r) => `${r.method} ${r.url}`),
      "requests to Resend",
    ).toEqual(["POST https://api.resend.com/emails"]);
    const request = resend.sent[0]!;
    expect(request.headers.get("authorization"), "the API key").toBe("Bearer made-up-resend-key");
    expect(request.headers.get("user-agent") ?? "", "the user agent Resend requires").not.toBe("");
    const email = JSON.parse(request.body) as { from: string; to: unknown; subject: string; text: string };
    expect(email.from, "the sender").toContain("onboarding@resend.dev");
    expect(email.to, "the recipients").toEqual(["maintainer@example.test"]);
    expect(`${email.subject} ${email.text}`, "the email").toContain("42");
  },
);

rule({ req: ["SP-3"], m: "M3" }, "if Resend refuses the email, the report waits", async () => {
  const resend = fakeFetch(() => ({
    status: 403,
    json: { message: "You can only send testing emails to your own email address" },
  }));
  const done = await deliverReport(report({ kind: "account-problem" }), {
    issues: new FakeIssues(),
    mailer: resendMailer("made-up-resend-key", { fetch: resend.fetch }),
    maintainerEmail: "someone-else@example.test",
  });
  expect(done.delivery, "the report").toBe("pending");
});

rule(
  { req: ["SP-1", "PV-2"], m: "M3" },
  "the server keeps a sender's daily count only until the next day has started everywhere",
  () => {
    expect(counterExpiry("2026-06-13").toISOString(), "when Bram's count for June 13 can go").toBe(
      "2026-06-15T00:00:00.000Z",
    );
    expect(counterExpiry("2026-12-31").toISOString(), "a count at the year's end").toBe("2027-01-02T00:00:00.000Z");
  },
);

rule(
  { req: ["SP-2"], m: "M3" },
  "a report whose first handling fails partway is still delivered by the retry",
  async () => {
    class FlakyStore extends FakeDeliveryStore {
      counterFailures = 1;
      override async updateCounter(uid: string, change: (counter: ReportCounter | undefined) => ReportCounter) {
        if (this.counterFailures-- > 0) throw new Error("transaction contention (fake)");
        return super.updateCounter(uid, change);
      }
    }
    const { issues, clock, deps } = server();
    const store = new FlakyStore();
    const ref = store.add(report());
    await expect(receiveReport(ref, { ...deps, store }), "the first handling").rejects.toThrow();
    expect(store.delivery(ref), "the report after the failure").toBe("pending");

    clock.advance(60 * 60_000);
    await retryQueued({ ...deps, store });
    expect(store.delivery(ref), "the report after the retry").toBe("issue-created");
    expect(issues.created.length, "issues created").toBe(1);
  },
);

rule(
  { req: ["SP-2", "PV-2"], m: "M3" },
  "a delivery that fails is logged with why, never with the report's text",
  async () => {
    const { issues, deps } = delivery();
    const logged: string[] = [];
    issues.down = true;
    const done = await deliverReport(report({ subject: "Made-up subject", message: "Made-up private message" }), {
      ...deps,
      log: (line) => logged.push(line),
    });
    expect(done.delivery, "the report").toBe("pending");
    expect(logged.length, "lines logged").toBe(1);
    expect(logged[0], "the log line").toContain("GitHub unreachable (fake)");
    expect(logged[0], "the log line").toContain("42");
    for (const text of ["Made-up subject", "Made-up private message", "uid-bram"]) {
      expect(logged[0], `the log line including ${text}`).not.toContain(text);
    }
  },
);

rule(
  { req: ["SP-1", "SP-2"], m: "M3" },
  "reports counted on the day they arrived aren't counted again when they're delivered the next day",
  async () => {
    const { issues, store, clock, deps } = server();
    clock.set("2026-06-13T23:00:00.000Z");
    issues.down = true;
    const late = Array.from({ length: 15 }, (_, i) => store.add(report({ id: `r${i + 1}`, number: i + 1 })));
    for (const ref of late) await receiveReport(ref, deps);
    expect(
      late.map((ref) => store.delivery(ref)),
      "the 15 reports while GitHub is down",
    ).toEqual(Array(15).fill("pending"));

    clock.set("2026-06-14T09:00:00.000Z");
    issues.down = false;
    const next = [16, 17].map((n) => store.add(report({ id: `r${n}`, number: n })));
    for (const ref of next) await receiveReport(ref, deps);
    await retryQueued(deps);
    expect(
      [...late, ...next].map((ref) => store.delivery(ref)),
      "all 17 reports, 15 from June 13 and 2 from June 14",
    ).toEqual(Array(17).fill("issue-created"));
  },
);

rule(
  { req: ["SP-2"], m: "M3" },
  "an issue GitHub accepted counts as delivered even if its reply can't be read, so the retry doesn't make it twice",
  async () => {
    const { privateKey } = rsaKeys();
    const garbled = (async (input: string | URL | Request) =>
      String(input).endsWith("/access_tokens")
        ? new Response(JSON.stringify({ token: "made-up-installation-token" }), { status: 201 })
        : new Response('{"number": 7, "title": "CM looks', { status: 201 })) as typeof fetch;
    const done = await deliverReport(report(), {
      issues: gitHubIssues(privateKey, { fetch: garbled, now: () => new Date() }),
      mailer: new FakeMailer(),
      maintainerEmail: "maintainer@example.test",
    });
    expect(done.delivery, "the report").toBe("issue-created");
    expect(done.issueNumber, "the issue number, unreadable").toBeUndefined();
  },
);

rule(
  { req: ["SP-1"], m: "M3" },
  "a report counted by a run that failed before finishing isn't counted again by the retry the same day",
  async () => {
    class FailsAfterCounting extends FakeDeliveryStore {
      failNextMark = true;
      override async updateQueue(ref: ReportRef, change: (entry: QueueEntry | undefined) => QueueEntry | undefined) {
        const marking = change({ leaseUntil: "9999-12-31T00:00:00.000Z" })?.counted === true;
        if (marking && this.failNextMark) {
          this.failNextMark = false;
          throw new Error("function timed out (fake)");
        }
        return super.updateQueue(ref, change);
      }
    }
    const { issues, clock, deps } = server();
    const store = new FailsAfterCounting();
    const first = store.add(report({ id: "r1", number: 1 }));
    await expect(receiveReport(first, { ...deps, store }), "the run that fails after counting").rejects.toThrow();
    clock.advance(60 * 60_000);
    await retryQueued({ ...deps, store });
    const more = Array.from({ length: 14 }, (_, i) => store.add(report({ id: `r${i + 2}`, number: i + 2 })));
    for (const ref of more) await receiveReport(ref, { ...deps, store });
    expect(
      [first, ...more].map((ref) => store.delivery(ref)),
      "Bram's 15 reports that day",
    ).toEqual(Array(15).fill("issue-created"));
    expect(issues.created.length, "issues created").toBe(15);
  },
);
