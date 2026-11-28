// Reports to the maintainer from the app (SP-1), through the data layer.
// Delivery to GitHub and email (SP-2, SP-3) is in tests/server/reports.test.ts.

import { expect, vi } from "vitest";
import { createAccounts } from "../../src/data/accounts";
import { AccessDeniedError, RateLimitError } from "../../src/errors";
import { localZone } from "../../src/platform/time";
import { FakeAuth } from "../support/fake-auth";
import { rule } from "../support/rule";
import { seedCharacter, seedProfile, world } from "../support/world";

async function setUp() {
  const w = world();
  const bram = w.as("bram");
  await seedProfile(bram, "bram");
  const aldric = await seedCharacter(bram, "aldric");
  return { w, bram, aldric };
}

rule(
  { req: ["SP-1"], m: "M3" },
  "a report has a kind, subject and message, can name a character, and waits to be delivered",
  async () => {
    const { w, bram, aldric } = await setUp();
    const report = await bram.sendReport({
      kind: "missing-skill",
      subject: "Skill not listed",
      message: "A made-up skill is missing.",
      characterId: aldric.character.id,
    });
    expect(report, "the saved report").toMatchObject({
      kind: "missing-skill",
      subject: "Skill not listed",
      message: "A made-up skill is missing.",
      characterId: aldric.character.id,
      sentAt: w.clock.iso(),
      appVersion: "0.1.0-test",
      delivery: "pending",
    });
    expect(report.number, "the report number").toBeGreaterThan(0);
    expect(
      (await bram.reports()).map((r) => r.id),
      "Bram's reports",
    ).toEqual([report.id]);
  },
);

rule(
  { req: ["SP-1"], m: "M3" },
  "every kind of report can be sent: missing or wrong skill, bug, idea, account problem",
  async () => {
    const { bram } = await setUp();
    for (const kind of ["missing-skill", "bug", "idea", "account-problem"] as const) {
      await bram.sendReport({ kind, subject: `About ${kind}`, message: "Made-up message." });
    }
    expect((await bram.reports()).map((r) => r.kind).sort(), "kinds of Bram's reports").toEqual([
      "account-problem",
      "bug",
      "idea",
      "missing-skill",
    ]);
  },
);

rule({ req: ["SP-1"], m: "M3" }, "report numbers are different for every report", async () => {
  const { w, bram } = await setUp();
  const cass = w.as("cass");
  await seedProfile(cass, "cass");
  const a = await bram.sendReport({ kind: "bug", subject: "One", message: "Made up." });
  const b = await cass.sendReport({ kind: "bug", subject: "Two", message: "Made up." });
  expect(a.number, "two reports' numbers").not.toBe(b.number);
});

rule({ req: ["SP-1"], m: "M3" }, "a report's number is a whole number from 10,000,000 to 99,999,999", async () => {
  const { bram } = await setUp();
  for (let i = 1; i <= 5; i++) {
    const report = await bram.sendReport({ kind: "bug", subject: `Bug ${i}`, message: "Made up." });
    expect(Number.isInteger(report.number), `report ${i}'s number ${report.number}, a whole number`).toBe(true);
    expect(report.number, `report ${i}'s number`).toBeGreaterThanOrEqual(10_000_000);
    expect(report.number, `report ${i}'s number`).toBeLessThanOrEqual(99_999_999);
  }
});

rule(
  { req: ["SP-1"], m: "M3" },
  "at most 15 reports a day: the sixteenth is refused, and the next day works again",
  async () => {
    const { w, bram } = await setUp();
    for (let i = 1; i <= 15; i++) await bram.sendReport({ kind: "idea", subject: `Idea ${i}`, message: "Made up." });
    const sixteenth = bram.sendReport({ kind: "idea", subject: "Idea 16", message: "Made up." });
    await expect(sixteenth, "a sixteenth report on the same day").rejects.toThrow(RateLimitError);
    await expect(sixteenth, "a sixteenth report on the same day").rejects.toMatchObject({ limit: 15 });
    expect((await bram.reports()).length, "Bram's reports").toBe(15);
    w.clock.advanceDays(1);
    const next = await bram.sendReport({ kind: "idea", subject: "Idea 17", message: "Made up." });
    expect(next.subject, "a report the next day").toBe("Idea 17");
  },
);

rule({ req: ["SP-1", "PV-1"], m: "M3" }, "only the sender can read a report", async () => {
  const { w, bram } = await setUp();
  const cass = w.as("cass");
  await seedProfile(cass, "cass");
  await bram.sendReport({ kind: "bug", subject: "Private", message: "Made up." });
  expect(await cass.reports(), "Cass's reports").toEqual([]);
  await expect(w.as(null).reports(), "a signed-out visitor's reports").rejects.toThrow(AccessDeniedError);
});

rule({ req: ["SP-1"], m: "M3" }, "a report can only name the sender's own character", async () => {
  const { w, bram } = await setUp();
  const cass = w.as("cass");
  await seedProfile(cass, "cass");
  const brin = await seedCharacter(cass, "brin");
  const attempt = bram.sendReport({ kind: "bug", subject: "Odd", message: "Made up.", characterId: brin.character.id });
  await expect(attempt, "Bram naming Cass's Brin in a report").rejects.toThrow(AccessDeniedError);
});

rule({ req: ["SP-1", "AC-5"], m: "M3" }, "reports are deleted with the account", async () => {
  const w = world();
  const auth = new FakeAuth();
  const store = w.forAuth(auth);
  const accounts = createAccounts({ auth, store: () => store, inviteList: async () => null });
  const signUp = {
    email: "wren@example.test",
    password: "a made-up password",
    displayName: "Wrenna",
    acceptedTerms: true,
  };
  await accounts.signUpWithEmail(signUp);
  auth.verifyEmail(signUp.email);
  await accounts.finishSignUp();
  const oldUid = auth.currentUser()!.uid;
  await store.sendReport({ kind: "idea", subject: "Made up", message: "Made up." });
  await accounts.deleteAccount("Wrenna");
  // TF-3: read as the deleted account's own user; a new sign-up would get a new one.
  const old = w.forAuth({ currentUser: () => ({ uid: oldUid }) });
  expect(await old.reports(), "the deleted account's reports").toEqual([]);
});

rule(
  { req: ["SP-1"], m: "M3" },
  "a refused sixteenth report says when more can be sent, in the user's local time",
  async () => {
    // A player in Chicago, at 10 am there (15:00 UTC): the count starts again at 7 pm, midnight UTC.
    vi.stubEnv("TZ", "America/Chicago");
    expect(localZone(), "the player's time zone").toBe("America/Chicago");
    const { w, bram } = await setUp();
    expect(w.clock.iso(), "the time the report is sent").toBe("2026-06-13T15:00:00.000Z");
    for (let i = 1; i <= 15; i++) await bram.sendReport({ kind: "idea", subject: `Idea ${i}`, message: "Made up." });
    const refused = bram.sendReport({ kind: "idea", subject: "Idea 16", message: "Made up." });
    await expect(refused, "the refusal").rejects.toThrow(
      /^You can send 15 reports a day\. You can send more from 7:00\sPM\.$/,
    );
  },
);
