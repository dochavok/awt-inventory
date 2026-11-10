// Working offline (NF-3), with the Firestore store against the emulator. Each
// "phone" is its own Firestore instance with its own offline cache; taking it
// offline is disableNetwork(), and signal returning is enableNetwork().

import { expect } from "vitest";
import { createFirestoreStore } from "../../src/data/firestore-store";
import type { InventoryStore } from "../../src/data/store";
import { device, seed, uid, useEmulator } from "../support/emulator";
import { FakeClock } from "../support/fake-clock";
import { testReferenceData } from "../support/fixtures";
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

async function setUp() {
  // Sign-up is invite-only before 1.0 (NF-13), so Bram is on the invite list.
  await seed({ "invites/bram@example.test": { addedBy: "maintainer" } });
  const a = phone("bram");
  await seedProfile(a.store, "bram");
  const aldric = await seedCharacter(a.store, "aldric");
  const draught = aldric.entries.get("aldric-draught")!.id;
  const b = phone("bram");
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
      const { a, b, draught } = await setUp();
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
