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
  expect(response.ok, `reading ${path} past the rules`).toBe(true);
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
  { req: ["SP-1"], m: "M3" },
  "through Firestore, a report's number is from 10,000,000 to 99,999,999, and the server stores the report",
  async () => {
    const bram = await signedUp("bram");
    const sent = [];
    for (let i = 1; i <= 5; i++)
      sent.push(await bram.store.sendReport({ kind: "bug", subject: `Bug ${i}`, message: "Made up." }));
    await synced(bram);
    for (const [i, report] of sent.entries()) {
      expect(Number.isInteger(report.number), `report ${i + 1}'s number ${report.number}, a whole number`).toBe(true);
      expect(report.number, `report ${i + 1}'s number`).toBeGreaterThanOrEqual(10_000_000);
      expect(report.number, `report ${i + 1}'s number`).toBeLessThanOrEqual(99_999_999);
    }
    expect(await storedCount(`users/${uid("bram")}/reports`), "Bram's stored reports").toBe(5);
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

rule(
  { req: ["GR-2", "GR-5", "EQ-2", "EQ-4", "TI-5"], m: "M4" },
  "through Firestore, grants and equipping change Aldric's totals, and a new phone sees the same",
  async () => {
    const bram = await signedUp("bram");
    const aldric = await seedCharacter(bram.store, "aldric", { full: true });
    const id = aldric.character.id;
    expect((await bram.store.totals(id)).cm.value, "Aldric's CM with the fixture's grants and equipment").toBe(170);
    await bram.store.addManualGrant(id, "DM ruling, Faire 2026", [{ kind: "cm", amount: 5 }]);
    await bram.store.addTitle({ name: "Wanderer", grants: [{ kind: "slots", slotKind: "back", amount: 1 }] });
    const cloak = aldric.entries.get("aldric-cloak")!.id;
    expect((await bram.store.equip(cloak, "back")).outcome, "equipping the Spare Cloak").toBe("allowed");
    await bram.store.unequip(aldric.entries.get("aldric-sword")!.id);
    // 170 + 5 (manual) + 5 (Spare Cloak) - 15 (Duskfang)
    expect((await bram.store.totals(id)).cm.value, "Aldric's CM after the changes").toBe(165);
    await synced(bram);
    const other = phone("bram");
    const sheet = await other.store.sheet(id);
    expect(
      sheet.equipped.map((q) => q.slot).sort(),
      "where Aldric's entries are equipped, read on a new phone",
    ).toEqual(["arcane", "back", "boot", "chest", "glove-arm", "head"]);
    expect((await other.store.totals(id)).cm.value, "Aldric's CM on a new phone").toBe(165);
    expect(JSON.stringify(await other.store.exportJson()), "the export, without edit times").not.toContain("edited");
  },
);

/** The address of one of Bram's stored documents, for reading it past the rules (the emulator's owner access). */
function storedUrl(path: string): string {
  return `http://${process.env.FIRESTORE_EMULATOR_HOST}/v1/projects/${PROJECT_ID}/databases/(default)/documents/${path}`;
}

/** The fields one of Bram's documents holds on the server, read past the rules. */
async function storedFields(path: string): Promise<string[]> {
  const response = await fetch(storedUrl(path), { headers: { Authorization: "Bearer owner" } });
  expect(response.ok, `reading ${path} past the rules`).toBe(true);
  const body = (await response.json()) as { fields?: Record<string, unknown> };
  return Object.keys(body.fields ?? {}).sort();
}

/** Gives a stored entry the extra damage field, as an earlier version of the app stored it (IN-3). */
async function withEarlierField(path: string): Promise<void> {
  const response = await fetch(`${storedUrl(path)}?updateMask.fieldPaths=extraDamage`, {
    method: "PATCH",
    headers: { Authorization: "Bearer owner", "Content-Type": "application/json" },
    body: JSON.stringify({ fields: { extraDamage: { integerValue: "2" } } }),
  });
  expect(response.ok, "setting up the earlier extra damage field").toBe(true);
  expect(await storedFields(path), "the stored fields once set up").toContain("extraDamage");
}

rule(
  { req: ["IN-3", "GR-13", "NF-6"], m: "M4" },
  "through Firestore, a weapon still holding the earlier extra damage field can be edited, equipped, unequipped, given a grant and traded; each change is kept and removes the field",
  async () => {
    const bram = await signedUp("bram");
    const aldric = await seedCharacter(bram.store, "aldric");
    const characterId = aldric.character.id;
    const entries = `users/${uid("bram")}/characters/${characterId}/entries`;
    const equipped = async (id: string) =>
      expect((await bram.store.equip(id, "off-hand")).outcome, "equipping a Hand Axe in the off-hand").toBe("allowed");
    // Unequipping comes first, so its axe has left the off-hand before another is equipped there.
    const changes: [string, (id: string) => Promise<unknown>, ((id: string) => Promise<unknown>)?][] = [
      ["unequipping", (id) => bram.store.unequip(id), equipped],
      ["an edit", (id) => bram.store.updateEntry(id, { notes: "Old, but sharp." })],
      ["equipping", equipped],
      ["a grant", (id) => bram.store.addGrant({ entryId: id }, { kind: "cm", amount: 1 })],
      ["trading one", (id) => bram.store.markTraded(id, { kind: "traded", quantity: 1 })],
    ];
    const axes: Record<string, string> = {};
    for (const [what, change, before] of changes) {
      const axe = await bram.store.addEntry(characterId, {
        category: "weapons",
        name: `Hand Axe (${what})`,
        quantity: 2,
        hands: 1,
        range: "melee",
      });
      await before?.(axe.id);
      await synced(bram);
      await withEarlierField(`${entries}/${axe.id}`);
      if (what === "unequipping") {
        // Equipped and still holding the field, as a new phone reads it from the server.
        const totals = await phone("bram").store.totals(characterId);
        expect(totals.damage.value, "Aldric's damage with the old field on the equipped Hand Axe").toBe(1);
        expect(totals.damage.grants, "where Aldric's damage comes from, the old field on the Hand Axe").toEqual([]);
      }
      await change(axe.id);
      await synced(bram);
      expect(await storedFields(`${entries}/${axe.id}`), `the stored Hand Axe after ${what}`).not.toContain(
        "extraDamage",
      );
      axes[what] = axe.id;
    }
    // Each change is kept, as a new phone reads it from the server.
    const other = phone("bram");
    const read = async (what: string) => other.store.entry(axes[what]!);
    const edited = await read("an edit");
    expect(edited.category !== "skills" && edited.notes, "the edited Hand Axe's notes").toBe("Old, but sharp.");
    expect((await read("trading one")).quantity, "the traded Hand Axe's quantity").toBe(1);
    const granted = await read("a grant");
    expect(
      granted.category !== "skills" && granted.grants?.map((g) => [g.kind, g.kind === "cm" && g.amount]),
      "the granted Hand Axe's grants",
    ).toEqual([["cm", 1]]);
    const sheet = await other.store.sheet(characterId);
    expect(
      sheet.equipped.map((q) => [q.entryId, q.slot]),
      "where Aldric's Hand Axes are equipped",
    ).toEqual([[axes["equipping"], "off-hand"]]);
    for (const id of Object.values(axes)) {
      expect(await other.store.entry(id), "a Hand Axe as read").not.toHaveProperty("extraDamage");
    }
  },
);

rule(
  { req: ["IN-3", "IN-15", "NF-6"], m: "M4" },
  "through Firestore, Undo brings back a deleted weapon that still held the earlier extra damage field, without it",
  async () => {
    const bram = await signedUp("bram");
    const aldric = await seedCharacter(bram.store, "aldric");
    const axe = await bram.store.addEntry(aldric.character.id, {
      category: "weapons",
      name: "Hand Axe",
      hands: 1,
      range: "melee",
    });
    await synced(bram);
    const path = `users/${uid("bram")}/characters/${aldric.character.id}/entries/${axe.id}`;
    await withEarlierField(path);
    // A new phone reads the record as the server holds it, field and all.
    const other = phone("bram");
    const deleted = await other.store.deleteEntry(axe.id);
    await synced(other);
    await deleted.undo();
    await synced(other);
    const fieldsBack = await storedFields(path);
    expect(fieldsBack, "the stored Hand Axe after Undo").toContain("name");
    expect(fieldsBack, "the stored Hand Axe after Undo").not.toContain("extraDamage");
    const back = await phone("bram").store.entry(axe.id);
    expect(back.category !== "skills" && back.name, "the Hand Axe after Undo, read on a third phone").toBe("Hand Axe");
  },
);

/** The IDs of the documents in one of Bram's collections, read from the server by a new phone of his. */
async function storedIds(path: string): Promise<string[]> {
  return (await device("bram").collection(path).get()).docs.map((d) => d.id).sort();
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
