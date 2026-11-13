// Working offline (NF-3), with the Firestore store against the emulator. Each
// "phone" is its own Firestore instance with its own offline cache; taking it
// offline is disableNetwork(), and signal returning is enableNetwork().

import { expect, vi } from "vitest";
import { createFirestoreStore, loadWholeAccount, type RefusedChange } from "../../src/data/firestore-store";
import { NotFoundError } from "../../src/errors";
import type { InventoryStore } from "../../src/data/store";
import { device, seed, uid, useEmulator } from "../support/emulator";
import { FakeClock } from "../support/fake-clock";
import { fixtureUser, testReferenceData } from "../support/fixtures";
import { rule } from "../support/rule";
import { seedCharacter, seedProfile } from "../support/world";

useEmulator();

const ref = testReferenceData();

/** A phone with its own offline cache. Phones in one test share that test's clock (TF-3). */
function phone(user: string, clock: FakeClock): { db: ReturnType<typeof device>; store: InventoryStore } {
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
  const clock = new FakeClock();
  const a = phone(user, clock);
  await seedProfile(a.store, user);
  const aldric = await seedCharacter(a.store, "aldric");
  const draught = aldric.entries.get("aldric-draught")!.id;
  const b = phone(user, clock);
  // Phone B opens Aldric with signal first, so his records are on it.
  await b.store.sheet(aldric.character.id);
  await b.store.history(aldric.character.id);
  return { a, b, clock, characterId: aldric.character.id, draught };
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
      const { a, b, clock, draught } = await setUp(order === "a-first" ? "bram" : "cass");
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

rule({ req: ["NF-3"], m: "M3" }, "one change to several fields of an entry counts as one change waiting", async () => {
  const { b, draught } = await setUp();
  await b.db.disableNetwork();
  await b.store.updateEntry(draught, { notes: "Kept for the gate", description: "Changed offline on phone B" });
  expect(await b.store.syncStatus(), "phone B offline").toEqual({ online: false, pendingChanges: 1 });
});

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
  { req: ["NF-3", "IN-12", "IN-13"], m: "M3" },
  "if two offline phones each use the last Healing Draught, both uses are kept, it's gone, and a restore brings back 1",
  async () => {
    const { a, b, characterId, draught } = await setUp();
    // Two of the three used with signal, so one is left.
    await a.store.markUsed(draught);
    await a.store.markUsed(draught);
    await a.db.waitForPendingWrites();
    await b.store.sheet(characterId);
    await a.db.disableNetwork();
    await b.db.disableNetwork();
    await a.store.markUsed(draught, { note: "phone A" });
    await b.store.markUsed(draught, { note: "phone B" });
    await online(a);
    await online(b);
    const offlineUses = (await a.store.history(characterId)).filter((r) => r.event === "used" && r.note);
    expect(offlineUses.map((r) => r.note).sort(), "the offline uses kept after both phones sync").toEqual([
      "phone A",
      "phone B",
    ]);
    await expect(a.store.entry(draught), "the Healing Draught after both phones sync").rejects.toThrow(NotFoundError);
    await a.store.restoreUsed(offlineUses.find((r) => r.note === "phone B")!.id);
    expect((await a.store.entry(draught)).quantity, "Healing Draughts after restoring phone B's use").toBe(1);
  },
);

rule(
  { req: ["NF-3"], m: "M3" },
  "an older change that sets the same value can't turn back the time of a later one",
  async () => {
    const { a, b, clock, draught, characterId } = await setUp();
    const c = phone("bram", clock);
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

rule(
  { req: ["NF-3", "CH-2"], m: "M3" },
  "saving a character's edit form with nothing changed doesn't beat another phone's earlier change",
  async () => {
    const { a, b, clock, characterId } = await setUp();
    const before = await a.store.character(characterId);
    await b.db.disableNetwork();
    await b.store.updateCharacter(characterId, { notes: "Written offline on phone B" });
    clock.advanceSeconds(60);
    // The edit form sends every field as it stands, the name as typed with spaces around it.
    await a.store.updateCharacter(characterId, {
      name: ` ${before.name} `,
      level: before.level,
      notes: before.notes ?? "",
    });
    await a.db.waitForPendingWrites();
    await online(b);
    expect((await a.store.character(characterId)).notes, "Aldric's notes after phone B syncs").toBe(
      "Written offline on phone B",
    );
  },
);

rule(
  { req: ["NF-3", "CH-6"], m: "M3" },
  "deleting a character offline counts as one change waiting, with the claims on its names",
  async () => {
    const { b, characterId } = await setUp();
    await loadWholeAccount(b.db, uid("bram"));
    await b.db.disableNetwork();
    await b.store.deleteCharacter(characterId, "Aldric");
    expect(await b.store.syncStatus(), "phone B offline after deleting Aldric").toEqual({
      online: false,
      pendingChanges: 1,
    });
  },
);

/** A phone that keeps what the server refused, as the app tells the user (NF-3). */
function phoneTold(user: string, clock: FakeClock) {
  const db = device(user);
  const refused: RefusedChange[] = [];
  const store = createFirestoreStore(
    db,
    { currentUid: () => uid(user), clock, ref, settings: { showSkillText: false, appVersion: "0.1.0-test" } },
    { onWriteRefused: (_error, change) => refused.push(change) },
  );
  return { db, store, refused };
}

/** Reads a document as its owner, straight from the server. */
async function storedOnServer(user: string, path: string): Promise<boolean> {
  return (await device(user).doc(path).get()).exists;
}

rule(
  { req: ["NF-3", "CH-1"], m: "M3" },
  "two offline phones each create Wren: the first to sync keeps it, the other is refused with what was added to it",
  async () => {
    const { a, clock, characterId } = await setUp();
    const c = phoneTold("bram", clock);
    const d = phoneTold("bram", clock);
    await c.store.listCharacters("main");
    await d.store.listCharacters("main");
    await c.db.disableNetwork();
    await d.db.disableNetwork();
    const wrenC = await c.store.createCharacter({ name: "Wren", className: "Rogue", level: 3 });
    await c.store.addEntry(wrenC.id, { category: "consumables", name: "Smoke Pellet" });
    const wrenD = await d.store.createCharacter({ name: "wren", className: "Mage", level: 5 });
    const rope = await d.store.addEntry(wrenD.id, { category: "items", name: "Silk Rope", arcane: false });
    await online(c);
    await online(d);
    await vi.waitFor(() => expect(d.refused.length, "changes phone D was told were refused").toBeGreaterThan(0));
    expect(d.refused, "what phone D was told").toContainEqual(
      expect.objectContaining({ kind: "character", id: wrenD.id, name: "wren" }),
    );
    expect(c.refused, "what phone C was told").toEqual([]);
    const characters = await a.store.listCharacters("main");
    expect(
      characters.map((ch) => [ch.id, ch.name]),
      "Bram's characters after both phones sync",
    ).toEqual([
      [characterId, "Aldric"],
      [wrenC.id, "Wren"],
    ]);
    expect(
      (await a.store.listEntries(wrenC.id, "consumables")).map((e) => ("name" in e.entry ? e.entry.name : e.entry.id)),
      "phone C's Wren's consumables",
    ).toEqual(["Smoke Pellet"]);
    const user = `users/${uid("bram")}/characters`;
    expect(await storedOnServer("bram", `${user}/${wrenD.id}`), "phone D's wren stored").toBe(false);
    expect(await storedOnServer("bram", `${user}/${wrenD.id}/entries/${rope.id}`), "phone D's Silk Rope stored").toBe(
      false,
    );
    expect(
      (await d.store.listCharacters("main")).map((ch) => ch.id),
      "Bram's characters on phone D after it syncs",
    ).toEqual([characterId, wrenC.id]);
  },
);

rule(
  { req: ["NF-3", "CH-1", "CH-2"], m: "M3" },
  "two offline phones each rename a character to Wren: the first to sync keeps the name, the other keeps its old one",
  async () => {
    const { a, clock, characterId } = await setUp();
    const brin = await a.store.createCharacter({ name: "Brin", className: "Rogue", level: 8 });
    await a.db.waitForPendingWrites();
    const c = phoneTold("bram", clock);
    const d = phoneTold("bram", clock);
    await c.store.listCharacters("main");
    await d.store.listCharacters("main");
    await c.db.disableNetwork();
    await d.db.disableNetwork();
    await c.store.updateCharacter(characterId, { name: "Wren" });
    await d.store.updateCharacter(brin.id, { name: "WREN" });
    await online(c);
    await online(d);
    await vi.waitFor(() => expect(d.refused.length, "changes phone D was told were refused").toBeGreaterThan(0));
    expect(d.refused, "what phone D was told").toContainEqual(
      expect.objectContaining({ kind: "character", id: brin.id, name: "WREN" }),
    );
    expect(c.refused, "what phone C was told").toEqual([]);
    expect(
      (await a.store.listCharacters("main")).map((ch) => [ch.id, ch.name]),
      "Bram's characters after both phones sync",
    ).toEqual([
      [brin.id, "Brin"],
      [characterId, "Wren"],
    ]);
  },
);

rule(
  { req: ["NF-3", "CH-1", "CH-2"], m: "M3" },
  "a name changed only in case stays claimed, so a phone that never saw it can't add a second Aldric",
  async () => {
    const { a, clock, characterId } = await setUp();
    await a.store.updateCharacter(characterId, { name: "ALDRIC" });
    await a.db.waitForPendingWrites();
    const d = phoneTold("bram", clock);
    await d.db.disableNetwork();
    const second = await d.store.createCharacter({ name: "aldric", className: "Mage", level: 2 });
    await online(d);
    await vi.waitFor(() => expect(d.refused.length, "changes phone D was told were refused").toBeGreaterThan(0));
    expect(d.refused, "what phone D was told").toContainEqual(
      expect.objectContaining({ kind: "character", id: second.id, name: "aldric" }),
    );
    expect(
      (await a.store.listCharacters("main")).map((ch) => [ch.id, ch.name]),
      "Bram's characters after phone D syncs",
    ).toEqual([[characterId, "ALDRIC"]]);
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

rule(
  { req: ["NF-3"], m: "M3" },
  "after the whole account is read on start, a phone has a character it never opened, offline",
  async () => {
    const { a, clock, characterId } = await setUp();
    const isolde = await seedCharacter(a.store, "isolde");
    const isoldeId = isolde.character.id;
    await a.store.updateCharacter(isoldeId, { level: 14 });
    await a.db.waitForPendingWrites();
    const isoldeHistory = (await a.store.history(isoldeId)).map((r) => [r.id, r.event]);
    expect(
      isoldeHistory.map(([, event]) => event),
      "Isolde's history events on phone A",
    ).toContain("level-changed");
    const titles = (await a.store.listTitles()).map((t) => t.name).sort();
    expect(titles.length, "Bram's titles on phone A").toBeGreaterThan(0);

    // Phone E opens the app with signal and does only what the app does on start.
    const e = phone("bram", clock);
    await loadWholeAccount(e.db, uid("bram"));
    await e.db.disableNetwork();

    expect(
      (await e.store.listCharacters("main")).map((c) => c.name),
      "Bram's characters on phone E offline",
    ).toEqual(["Aldric", "Isolde"]);
    expect((await e.store.character(isoldeId)).level, "Isolde's level on phone E offline").toBe(14);
    expect(
      (await e.store.listEntries(isoldeId, "items")).map((i) => ("name" in i.entry ? i.entry.name : i.entry.id)),
      "Isolde's items on phone E offline",
    ).toEqual(["Glass Orb"]);
    expect((await e.store.sheet(isoldeId)).entries.length, "Isolde's entries on phone E offline").toBe(3);
    expect(
      (await e.store.history(isoldeId)).map((r) => [r.id, r.event]),
      "Isolde's history on phone E offline",
    ).toEqual(isoldeHistory);
    expect((await e.store.sheet(characterId)).entries.length, "Aldric's entries on phone E offline").toBe(18);
    expect((await e.store.listTitles()).map((t) => t.name).sort(), "Bram's titles on phone E offline").toEqual(titles);
    expect(
      (await e.store.search("orb", { allCharacters: true })).map((r) => `${r.characterName}: ${r.name}`),
      "searching every character on phone E offline",
    ).toEqual(["Isolde: Glass Orb"]);
  },
);

rule(
  { req: ["CH-6", "NF-3", "CH-1"], m: "M3" },
  "a phone that only read the account on start deletes a character offline, and the claims on its names go too",
  async () => {
    const { a, clock } = await setUp();
    const wren = await a.store.createCharacter({ name: "Wren", className: "Rogue", level: 3 });
    await a.store.updateCharacter(wren.id, { name: "Brin" });
    await a.db.waitForPendingWrites();
    const names = `users/${uid("bram")}/characterNames`;
    for (const name of ["aldric", "wren", "brin"]) {
      expect(await storedOnServer("bram", `${names}/name-${name}`), `the claim on ${name} before`).toBe(true);
    }

    const e = phone("bram", clock);
    await loadWholeAccount(e.db, uid("bram"));
    await e.db.disableNetwork();
    await e.store.deleteCharacter(wren.id, "Brin");
    await online(e);

    expect(await storedOnServer("bram", `${names}/name-wren`), "the claim on Wren, Brin's old name").toBe(false);
    expect(await storedOnServer("bram", `${names}/name-brin`), "the claim on Brin").toBe(false);
    expect(await storedOnServer("bram", `${names}/name-aldric`), "the claim on Aldric, who wasn't deleted").toBe(true);
  },
);

rule(
  { req: ["NF-3"], m: "M3" },
  "reading the whole account without signal fails, rather than counting what the phone already had",
  async () => {
    const { clock } = await setUp();
    const e = phone("bram", clock);
    await e.db.disableNetwork();
    await expect(loadWholeAccount(e.db, uid("bram")), "reading the whole account offline").rejects.toThrow();
  },
);
