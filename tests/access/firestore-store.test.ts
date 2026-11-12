// The Firestore store against the emulator (TF-2, TF-11). The data-layer tests
// in tests/data/ check the shared logic through the in-memory store; these
// check the same flows end to end through Firestore and firestore.rules, so
// the store the app runs is tested too. Each test starts its own users.

import { expect } from "vitest";
import { createFirestoreStore } from "../../src/data/firestore-store";
import type { InventoryStore } from "../../src/data/store";
import { NotFoundError } from "../../src/errors";
import { PROJECT_ID, device, seed, uid, useEmulator } from "../support/emulator";
import { FakeClock } from "../support/fake-clock";
import { fixtureUser, testReferenceData } from "../support/fixtures";
import { rule } from "../support/rule";
import { seedCharacter, seedProfile } from "../support/world";

useEmulator();

const ref = testReferenceData();

function phone(user: string, clock = new FakeClock()): { db: ReturnType<typeof device>; store: InventoryStore } {
  const db = device(user);
  const store = createFirestoreStore(db, {
    currentUid: () => uid(user),
    clock,
    ref,
    settings: { showSkillText: false, appVersion: "0.1.0-test" },
  });
  return { db, store };
}

/** An invited user with a profile, on one phone. */
async function signedUp(user: string, clock = new FakeClock()) {
  await seed({ [`invites/${fixtureUser(user).email}`]: { addedBy: "maintainer" } });
  const p = phone(user, clock);
  await seedProfile(p.store, user);
  return p;
}

/** Waits until every change the phone made has reached the emulator. */
async function synced(p: ReturnType<typeof phone>) {
  await p.db.waitForPendingWrites();
}

/** How many documents a collection holds, read past the rules (the emulator's owner access). */
async function storedCount(path: string): Promise<number> {
  const host = process.env.FIRESTORE_EMULATOR_HOST;
  const response = await fetch(`http://${host}/v1/projects/${PROJECT_ID}/databases/(default)/documents/${path}`, {
    headers: { Authorization: "Bearer owner" },
  });
  const body = (await response.json()) as { documents?: unknown[] };
  return body.documents?.length ?? 0;
}

rule(
  { req: ["CH-1", "CH-2", "CH-3", "CH-5"], m: "M2" },
  "through Firestore, a character is made, renamed, levelled, retired and brought back",
  async () => {
    const bram = await signedUp("bram");
    const wren = await bram.store.createCharacter({ name: "Wren", className: "Rogue", level: 3 });
    await bram.store.updateCharacter(wren.id, { name: "Wren the Quick", level: 4 });
    await bram.store.retireCharacter(wren.id);
    expect(
      (await bram.store.listCharacters("retired")).map((c) => [c.name, c.level]),
      "Bram's retired characters",
    ).toEqual([["Wren the Quick", 4]]);
    await bram.store.restoreCharacter(wren.id);
    expect(
      (await bram.store.listCharacters("main")).map((c) => c.name),
      "Bram's main list",
    ).toEqual(["Wren the Quick"]);
    const [levelled] = await bram.store.history(wren.id);
    expect(levelled, "Wren's level change").toMatchObject({ event: "level-changed", summary: "Level 3 → 4" });
    await synced(bram);
  },
);

rule(
  { req: ["IN-12", "IN-13", "IN-14", "IN-16", "HI-1"], m: "M2" },
  "through Firestore, a draught is used to zero and restored, part of a stack is traded, and the history keeps it all",
  async () => {
    const bram = await signedUp("bram");
    const aldric = await seedCharacter(bram.store, "aldric");
    const draught = aldric.entries.get("aldric-draught")!.id;
    for (let i = 0; i < 3; i++) await bram.store.markUsed(draught);
    await expect(bram.store.entry(draught), "Healing Draught at zero").rejects.toThrow(NotFoundError);
    const usedRecords = (await bram.store.history(aldric.character.id, { events: ["used"] })).map((r) => r.id);
    expect(usedRecords.length, "used records for Healing Draught").toBe(3);
    await bram.store.restoreUsed(usedRecords[0]!);
    expect((await bram.store.entry(draught)).quantity, "Healing Draughts after one restore").toBe(1);
    const shard = aldric.entries.get("aldric-shard")!.id;
    const before = (await bram.store.entry(shard)).quantity;
    const traded = await bram.store.markTraded(shard, { kind: "traded", quantity: 1, note: "to a made-up friend" });
    expect(traded.snapshot, "the traded record's snapshot").toMatchObject({ name: "Ember Shard", quantity: 1 });
    expect((await bram.store.entry(shard)).quantity, "Ember Shards after trading one").toBe(before - 1);
    const [newest] = await bram.store.history(aldric.character.id);
    expect(newest, "the newest record").toMatchObject({ event: "traded", entryName: "Ember Shard" });
    await synced(bram);
  },
);

rule(
  { req: ["IN-15"], m: "M2" },
  "through Firestore, a deleted entry leaves no trace, and Undo brings it back with its history",
  async () => {
    const clock = new FakeClock();
    const bram = await signedUp("bram", clock);
    const aldric = await seedCharacter(bram.store, "aldric");
    const lantern = aldric.entries.get("aldric-lantern")!.id;
    const deleted = await bram.store.deleteEntry(lantern);
    await expect(bram.store.entry(lantern), "the Hooded Lantern after deleting").rejects.toThrow(NotFoundError);
    const about = async () =>
      (await bram.store.history(aldric.character.id)).filter((r) => r.entryId === lantern).length;
    expect(await about(), "history records about the Hooded Lantern after deleting").toBe(0);
    clock.advanceSeconds(5);
    await deleted.undo();
    const back = await bram.store.entry(lantern);
    expect(back.category !== "skills" && back.name, "the Hooded Lantern after Undo").toBe("Hooded Lantern");
    expect(await about(), "history records about the Hooded Lantern after Undo").toBe(1);
    await synced(bram);
  },
);

rule(
  { req: ["TI-1", "TI-2", "CH-6"], m: "M2" },
  "through Firestore, deleting a character takes its character-level titles and keeps the player-level ones",
  async () => {
    const bram = await signedUp("bram");
    const wren = await bram.store.createCharacter({ name: "Wren", className: "Rogue", level: 3 });
    await bram.store.addTitle({ name: "Made-up Champion", description: "Player-level." });
    await bram.store.addTitle({ name: "Wren's Oath", scope: { level: "character", characterId: wren.id } });
    expect(
      (await bram.store.titlesFor(wren.id)).map((t) => t.name),
      "titles that apply to Wren",
    ).toEqual(["Made-up Champion", "Wren's Oath"]);
    await bram.store.deleteCharacter(wren.id, "Wren");
    expect(
      (await bram.store.listTitles()).map((t) => t.name),
      "Bram's titles after deleting Wren",
    ).toEqual(["Made-up Champion"]);
    await synced(bram);
    expect(await storedCount(`users/${uid("bram")}/characters`), "Bram's stored characters").toBe(0);
  },
);

rule(
  { req: ["SK-1", "SK-2"], m: "M2" },
  "through Firestore, a skill picked from the list shows its name, tree and usage",
  async () => {
    const bram = await signedUp("bram");
    const aldric = await seedCharacter(bram.store, "aldric");
    const views = await bram.store.skills(aldric.character.id);
    const edge = views.find((s) => s.name === "Veteran's Edge");
    expect(edge, "Veteran's Edge on Aldric").toMatchObject({ usage: "passive", tier: "normal" });
    expect(edge?.text, "Veteran's Edge's card text, without the owner's agreement").toBeUndefined();
  },
);

rule(
  { req: ["PV-1"], m: "M2" },
  "through Firestore, Cass's store can't find Bram's character, even by its ID",
  async () => {
    const bram = await signedUp("bram");
    const aldric = await seedCharacter(bram.store, "aldric");
    await synced(bram);
    const cass = await signedUp("cass");
    await expect(cass.store.character(aldric.character.id), "Cass reading Bram's Aldric").rejects.toThrow(
      NotFoundError,
    );
    expect(await cass.store.search("Duskfang", { allCharacters: true }), "Cass searching for Duskfang").toEqual([]);
  },
);

rule(
  { req: ["SE-1", "EX-4"], m: "M3" },
  "through Firestore, search finds an entry and the JSON export holds the character",
  async () => {
    const bram = await signedUp("bram");
    const aldric = await seedCharacter(bram.store, "aldric");
    expect(
      (await bram.store.search("dusk", { characterId: aldric.character.id })).map((r) => r.name),
      "Aldric's results for dusk",
    ).toContain("Duskfang");
    const file = await bram.store.exportJson();
    const out = file.characters.find((c) => c.character.name === "Aldric");
    expect(out?.entries.length, "Aldric's entries in the export").toBe(18);
    expect(JSON.stringify(file), "the export, without edit times").not.toContain("edited");
  },
);

rule(
  { req: ["SP-1", "AC-5"], m: "M3" },
  "through Firestore, deleting the account removes its characters, titles and reports",
  async () => {
    const bram = await signedUp("bram");
    await seedCharacter(bram.store, "aldric");
    await bram.store.addTitle({ name: "Made-up Champion" });
    await bram.store.sendReport({ kind: "idea", subject: "Made up", message: "Made up." });
    await synced(bram);
    expect(await storedCount(`users/${uid("bram")}/reports`), "Bram's stored reports before").toBe(1);
    await bram.store.deleteAccount("Bramblewick");
    for (const what of ["characters", "titles", "reports"]) {
      expect(await storedCount(`users/${uid("bram")}/${what}`), `Bram's stored ${what} after deleting`).toBe(0);
    }
  },
);

rule(
  { req: ["AC-5", "NF-3", "CH-1"], m: "M3" },
  "through Firestore, deleting the account removes the claims on its characters' names, past names included",
  async () => {
    const bram = await signedUp("bram");
    const wren = await bram.store.createCharacter({ name: "Wren", className: "Rogue", level: 3 });
    await bram.store.updateCharacter(wren.id, { name: "Brin" });
    await synced(bram);
    const names = `users/${uid("bram")}/characterNames`;
    expect(await storedCount(names), "Bram's claimed names before (Wren, then Brin)").toBe(2);
    await bram.store.deleteAccount("Bramblewick");
    expect(await storedCount(names), "Bram's claimed names after deleting").toBe(0);
  },
);

rule(
  { req: ["NF-3"], m: "M3" },
  "when two offline phones change different fields of one entry, both changes are kept",
  async () => {
    for (const order of ["a-first", "b-first"] as const) {
      const user = order === "a-first" ? "bram" : "cass";
      const clock = new FakeClock();
      const a = await signedUp(user, clock);
      const aldric = await seedCharacter(a.store, "aldric");
      const draught = aldric.entries.get("aldric-draught")!.id;
      const b = phone(user, clock);
      await b.store.sheet(aldric.character.id);
      await a.db.disableNetwork();
      await b.db.disableNetwork();
      await a.store.updateEntry(draught, { notes: "earlier note, phone A", description: "A's description" });
      clock.advanceSeconds(60);
      await b.store.updateEntry(draught, { notes: "later note, phone B" });
      for (const p of order === "a-first" ? [a, b] : [b, a]) {
        await p.db.enableNetwork();
        await p.db.waitForPendingWrites();
      }
      const entry = await a.store.entry(draught);
      expect(
        [entry.notes, entry.category !== "skills" && entry.description],
        `Healing Draught's notes and description when ${order === "a-first" ? "phone A" : "phone B"} syncs first`,
      ).toEqual(["later note, phone B", "A's description"]);
    }
  },
);

/** The IDs of the documents in a collection, read past the rules. */
async function storedIds(path: string): Promise<string[]> {
  const host = process.env.FIRESTORE_EMULATOR_HOST;
  const response = await fetch(`http://${host}/v1/projects/${PROJECT_ID}/databases/(default)/documents/${path}`, {
    headers: { Authorization: "Bearer owner" },
  });
  const body = (await response.json()) as { documents?: { name: string }[] };
  return (body.documents ?? []).map((d) => d.name.split("/").pop()!).sort();
}

rule(
  { req: ["CH-6", "CH-1"], m: "M3" },
  "through Firestore, deleting a character removes the claims that still point to it, and no other",
  async () => {
    const bram = await signedUp("bram");
    const first = await bram.store.createCharacter({ name: "Wren", className: "Rogue", level: 3 });
    await bram.store.updateCharacter(first.id, { name: "Brin" });
    // A new Wren takes over the old claim on "wren", so it no longer points to the first character.
    await bram.store.createCharacter({ name: "Wren", className: "Mage", level: 1 });
    await bram.store.createCharacter({ name: "Aldric", className: "Warrior", level: 26 });
    await synced(bram);
    const names = `users/${uid("bram")}/characterNames`;
    expect(await storedIds(names), "Bram's claimed names before").toEqual(["name-aldric", "name-brin", "name-wren"]);
    await bram.store.deleteCharacter(first.id, "Brin");
    await synced(bram);
    expect(await storedIds(names), "Bram's claimed names after deleting Brin").toEqual(["name-aldric", "name-wren"]);
  },
);
