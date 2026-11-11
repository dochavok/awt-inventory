// Working offline (NF-3), with the Firestore store against the emulator. Each
// "phone" is its own Firestore instance with its own offline cache; taking it
// offline is disableNetwork(), and signal returning is enableNetwork().

import { expect } from "vitest";
import { createFirestoreStore } from "../../src/data/firestore-store";
import type { InventoryStore } from "../../src/data/store";
import { device, seed, uid, useEmulator } from "../support/emulator";
import { FakeClock } from "../support/fake-clock";
import { fixtureUser, testReferenceData } from "../support/fixtures";
import { rule } from "../support/rule";
import { seedCharacter, seedProfile } from "../support/world";

useEmulator();

const clock = new FakeClock();
const ref = testReferenceData();

function phone(user: string): { db: ReturnType<typeof device>; store: InventoryStore } {
  const db = device(user);
  const store = createFirestoreStore(db, {
    currentUid: () => uid(user),
    clock,
    ref,
    settings: { showSkillText: false, appVersion: "0.1.0-test" },
  });
  return { db, store };
}

async function online(p: ReturnType<typeof phone>) {
  await p.db.enableNetwork();
  await p.db.waitForPendingWrites();
}

/**
 * Two phones signed in as `user` (Bram unless a test needs a second setup),
 * with Aldric made on phone A. A second setup in the same test uses another
 * user, so the first setup's data stays in the database, as it would in use (TF-3).
 */
async function setUp(user = "bram") {
  // Sign-up is invite-only before 1.0 (NF-13), so the user is on the invite list.
  await seed({ [`invites/${fixtureUser(user).email}`]: { addedBy: "maintainer" } });
  const a = phone(user);
  await seedProfile(a.store, user);
  const aldric = await seedCharacter(a.store, "aldric");
  const draught = aldric.entries.get("aldric-draught")!.id;
  const b = phone(user);
  // Phone B opens Aldric with signal first, so his records are on it.
  await b.store.sheet(aldric.character.id);
  await b.store.history(aldric.character.id);
  return { a, b, characterId: aldric.character.id, draught };
}

rule(
  { req: ["NF-3"], m: "M3" },
  "without signal, a phone can still view and search what it opened before",
  async () => {
    const { b, characterId } = await setUp();
    await b.db.disableNetwork();
    expect(
      (await b.store.listCharacters("main")).map((c) => c.name),
      "Bram's characters offline",
    ).toEqual(["Aldric"]);
    expect((await b.store.sheet(characterId)).entries.length, "Aldric's entries offline").toBe(18);
    const results = await b.store.search("Dusk", { characterId });
    expect(
      results.map((r) => r.name),
      "searching offline",
    ).toEqual(["Duskfang"]);
  },
);

rule(
  { req: ["NF-3"], m: "M3" },
  "the app shows it's offline and how many changes are waiting, then sends them",
  async () => {
    const { a, b, draught } = await setUp();
    await b.db.disableNetwork();
    await b.store.markUsed(draught);
    await b.store.updateEntry(draught, { notes: "Used one at the gate" });
    const waiting = await b.store.syncStatus();
    expect(waiting, "phone B offline").toEqual({ online: false, pendingChanges: 2 });
    await online(b);
    expect(await b.store.syncStatus(), "phone B back online").toEqual({ online: true, pendingChanges: 0 });
    expect((await a.store.entry(draught)).quantity, "Healing Draughts seen on phone A").toBe(2);
  },
);

rule(
  { req: ["NF-3", "IN-12"], m: "M3" },
  "one draught used on each of two offline phones means two fewer, and both records are kept",
  async () => {
    const { a, b, characterId, draught } = await setUp();
    await a.db.disableNetwork();
    await b.db.disableNetwork();
    await a.store.markUsed(draught, { note: "phone A" });
    await b.store.markUsed(draught, { note: "phone B" });
    await online(a);
    await online(b);
    expect((await a.store.entry(draught)).quantity, "Healing Draughts after both phones sync").toBe(1);
    const notes = (await a.store.history(characterId))
      .filter((r) => r.event === "used")
      .map((r) => r.note)
      .sort();
    expect(notes, "the used records from both phones").toEqual(["phone A", "phone B"]);
  },
);

rule(
  { req: ["NF-3"], m: "M3" },
  "when two offline phones change the same field, the later change wins, whichever syncs last",
  async () => {
    for (const order of ["a-first", "b-first"] as const) {
      const { a, b, draught } = await setUp(order === "a-first" ? "bram" : "cass");
      await a.db.disableNetwork();
      await b.db.disableNetwork();
      await a.store.updateEntry(draught, { notes: "earlier note, phone A" });
      clock.advanceSeconds(60);
      await b.store.updateEntry(draught, { notes: "later note, phone B" });
      for (const p of order === "a-first" ? [a, b] : [b, a]) await online(p);
      const notes = (await a.store.entry(draught)).notes;
      expect(notes, `Healing Draught's notes when ${order === "a-first" ? "phone A" : "phone B"} syncs first`).toBe(
        "later note, phone B",
      );
    }
  },
);

rule(
  { req: ["NF-3"], m: "M3" },
  "a phone without signal can change the display name without waiting, and it's sent when signal returns",
  async () => {
    const { a, b } = await setUp();
    await b.store.profile();
    await b.db.disableNetwork();
    const waited = await Promise.race([
      b.store.setDisplayName("Bram the Bold").then(() => "done"),
      new Promise((resolve) => setTimeout(() => resolve("still waiting"), 2000)),
    ]);
    expect(waited, "changing the display name offline").toBe("done");
    expect(await b.store.syncStatus(), "phone B offline").toEqual({ online: false, pendingChanges: 1 });
    await online(b);
    expect((await a.store.profile()).displayName, "Bram's display name seen on phone A").toBe("Bram the Bold");
  },
);

rule(
  { req: ["NF-3", "IN-12"], m: "M3" },
  "if two offline phones each trade away every Healing Draught, only the first to sync counts",
  async () => {
    const { a, b, characterId, draught } = await setUp();
    await a.db.disableNetwork();
    await b.db.disableNetwork();
    await a.store.markTraded(draught, { kind: "traded", note: "phone A" });
    await b.store.markTraded(draught, { kind: "traded", note: "phone B" });
    await online(a);
    await online(b);
    const traded = (await a.store.history(characterId)).filter((r) => r.event === "traded");
    expect(
      traded.map((r) => [r.note, r.quantity]),
      "Healing Draught trades recorded after both phones sync",
    ).toEqual([["phone A", 3]]);
  },
);

rule(
  { req: ["NF-3"], m: "M3" },
  "an older change that sets the same value can't turn back the time of a later one",
  async () => {
    const { a, b, draught, characterId } = await setUp();
    const c = phone("bram");
    await c.store.sheet(characterId);
    await b.db.disableNetwork();
    await c.db.disableNetwork();
    await b.store.updateEntry(draught, { notes: "Kept for the gate" });
    clock.advanceSeconds(30);
    await c.store.updateEntry(draught, { notes: "older note, phone C" });
    clock.advanceSeconds(30);
    await a.store.updateEntry(draught, { notes: "Kept for the gate" });
    await a.db.waitForPendingWrites();
    await online(b);
    await online(c);
    expect((await a.store.entry(draught)).notes, "Healing Draught's notes after phones B and C sync").toBe(
      "Kept for the gate",
    );
  },
);

rule({ req: ["NF-3", "SP-1"], m: "M3" }, "a report written offline is sent when signal returns", async () => {
  const { a, b } = await setUp();
  await b.db.disableNetwork();
  const report = await b.store.sendReport({ kind: "idea", subject: "Written offline", message: "Made up." });
  await online(b);
  expect(
    (await a.store.reports()).map((r) => r.id),
    "reports seen on phone A",
  ).toEqual([report.id]);
});
