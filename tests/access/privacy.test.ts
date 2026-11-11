// Server-side access rules (PV-1, NF-7, TF-11), run against the Firestore
// emulator with the repository's firestore.rules.
//
// Data layout these tests fix for M2 (TF-2):
//   users/{uid}                                   the user's profile (display name)
//   users/{uid}/characters/{characterId}
//   users/{uid}/characters/{characterId}/entries/{entryId}
//   users/{uid}/characters/{characterId}/history/{recordId}
//   users/{uid}/titles/{titleId}
//   users/{uid}/reports/{reportId}                reports to the maintainer (SP-1)
//   listings/{listingId}                          entries offered for trade: only
//                                                 the fields section 3.2 allows
//   invites/{email}                               the allow list (NF-13)
// Each test checks the owner is allowed AND the other user (Cass) and a
// signed-out visitor are refused (TF-8).

import { LIMITS } from "../../src/data/validate";
import { rule } from "../support/rule";
import { expectAllowed, expectRefused, seed, signedIn, signedOut, uid, useEmulator } from "../support/emulator";

useEmulator();

const bram = () => uid("bram");
const character = () => `users/${bram()}/characters/aldric`;

async function seedAldric(): Promise<void> {
  await seed({
    [`users/${bram()}`]: { displayName: "Bramblewick" },
    [character()]: { name: "Aldric", className: "Warrior", level: 25 },
    [`${character()}/entries/aldric-sword`]: {
      category: "weapons",
      name: "Duskfang",
      quantity: 1,
      notes: "Private note",
    },
    [`${character()}/history/h1`]: { event: "acquired", entryId: "aldric-sword", quantity: 1 },
    [`users/${bram()}/titles/t-forest`]: { name: "Friend of the Forest", scope: { level: "player" } },
  });
}

/** Bram, who lists things for trade, is invited and has his profile (NF-13, section 3.2). */
async function seedListingOwner(): Promise<void> {
  await seed({
    "invites/bram@example.test": { addedBy: "maintainer" },
    [`users/${bram()}`]: { displayName: "Bramblewick", email: "bram@example.test" },
  });
}

/** Owner allowed to read and change `path`; Cass and a signed-out visitor refused both. */
async function ownerOnly(path: string, change: Record<string, unknown>, what: string): Promise<void> {
  await seedAldric();
  const mine = signedIn("bram").firestore();
  await expectAllowed(mine.doc(path).get(), `Bram reading his ${what}`);
  await expectAllowed(mine.doc(path).set(change, { merge: true }), `Bram changing his ${what}`);
  for (const [who, db] of [
    ["Cass", signedIn("cass").firestore()],
    ["a signed-out visitor", signedOut().firestore()],
  ] as const) {
    await expectRefused(db.doc(path).get(), `${who} reading Bram's ${what}`);
    await expectRefused(db.doc(path).set(change, { merge: true }), `${who} changing Bram's ${what}`);
    await expectRefused(db.doc(path).delete(), `${who} deleting Bram's ${what}`);
  }
}

rule({ req: ["PV-1", "TF-11", "NF-7"], m: "M2" }, "only Bram can read and change his profile", () =>
  ownerOnly(`users/${uid("bram")}`, { displayName: "Bram the Bold" }, "profile"),
);

rule({ req: ["PV-1", "TF-11"], m: "M2" }, "only Bram can read and change his character Aldric", () =>
  ownerOnly(character(), { level: 26 }, "character Aldric"),
);

rule({ req: ["PV-1", "TF-11"], m: "M2" }, "only Bram can read and change Aldric's entries", () =>
  ownerOnly(`${character()}/entries/aldric-sword`, { quantity: 2 }, "entry Duskfang"),
);

rule({ req: ["PV-1", "TF-11"], m: "M2" }, "only Bram can read and change his titles", () =>
  ownerOnly(`users/${uid("bram")}/titles/t-forest`, { description: "Made-up title." }, "title"),
);

rule({ req: ["PV-1", "TF-11"], m: "M2" }, "Cass can't list Bram's characters, and Bram can", async () => {
  await seedAldric();
  const path = `users/${bram()}/characters`;
  await expectAllowed(signedIn("bram").firestore().collection(path).get(), "Bram listing his characters");
  await expectRefused(signedIn("cass").firestore().collection(path).get(), "Cass listing Bram's characters");
  await expectRefused(signedOut().firestore().collection(path).get(), "a signed-out visitor listing Bram's characters");
});

rule({ req: ["PV-1", "TF-11"], m: "M2" }, "Cass can't create a character in Bram's account, and Bram can", async () => {
  await seedAldric();
  const path = `users/${bram()}/characters/new-one`;
  const data = { name: "Wren", className: "Rogue", level: 1 };
  await expectRefused(signedIn("cass").firestore().doc(path).set(data), "Cass creating a character for Bram");
  await expectAllowed(signedIn("bram").firestore().doc(path).set(data), "Bram creating a character");
});

rule(
  { req: ["PV-1", "HI-4", "TF-11"], m: "M2" },
  "Bram can read and add to Aldric's history but can't edit or remove a record; Cass can't read it",
  async () => {
    await seedAldric();
    const record = `${character()}/history/h1`;
    const mine = signedIn("bram").firestore();
    await expectAllowed(mine.doc(record).get(), "Bram reading a history record");
    await expectAllowed(
      mine.doc(`${character()}/history/h2`).set({ event: "used", entryId: "aldric-sword", quantity: 1 }),
      "Bram adding a history record",
    );
    await expectRefused(mine.doc(record).update({ quantity: 5 }), "Bram editing a history record");
    await expectRefused(mine.doc(record).delete(), "Bram removing one history record on its own");
    await expectRefused(signedIn("cass").firestore().doc(record).get(), "Cass reading Aldric's history");
  },
);

rule(
  { req: ["PV-1", "TF-11"], m: "M2" },
  "any signed-in user can read a trade listing, only its owner can change it, and signed-out visitors can't read it",
  async () => {
    await seedListingOwner();
    await seed({
      "listings/l1": {
        ownerUid: bram(),
        ownerName: "Bramblewick",
        name: "Duskfang",
        category: "weapons",
        quantity: 1,
      },
    });
    await expectAllowed(signedIn("cass").firestore().doc("listings/l1").get(), "Cass reading Bram's listing");
    await expectRefused(
      signedIn("cass").firestore().doc("listings/l1").update({ quantity: 9 }),
      "Cass changing Bram's listing",
    );
    await expectRefused(signedIn("cass").firestore().doc("listings/l1").delete(), "Cass deleting Bram's listing");
    await expectRefused(signedOut().firestore().doc("listings/l1").get(), "a signed-out visitor reading a listing");
    await expectAllowed(
      signedIn("bram").firestore().doc("listings/l1").update({ quantity: 2 }),
      "Bram changing his listing",
    );
  },
);

rule(
  { req: ["PV-1", "TF-11"], m: "M2" },
  "a listing can't carry fields beyond those section 3.2 allows, and can't be created in another user's name",
  async () => {
    await seedListingOwner();
    const listing = { ownerUid: bram(), ownerName: "Bramblewick", name: "Duskfang", category: "weapons", quantity: 1 };
    const db = signedIn("bram").firestore();
    await expectAllowed(db.doc("listings/ok").set(listing), "Bram listing Duskfang");
    await expectRefused(db.doc("listings/notes").set({ ...listing, notes: "Private note" }), "a listing with notes");
    await expectRefused(
      db.doc("listings/char").set({ ...listing, characterName: "Aldric" }),
      "a listing naming the character",
    );
    await expectRefused(
      signedIn("cass").firestore().doc("listings/fake").set(listing),
      "Cass creating a listing in Bram's name",
    );
  },
);

rule({ req: ["SP-1", "TF-11"], m: "M3" }, "Bram can send and read his own reports; Cass can't read them", async () => {
  await seedAldric();
  const path = `users/${bram()}/reports/r1`;
  const report = { kind: "bug", subject: "Totals", message: "The CM looked wrong." };
  await expectAllowed(signedIn("bram").firestore().doc(path).set(report), "Bram sending a report");
  await expectAllowed(signedIn("bram").firestore().doc(path).get(), "Bram reading his report");
  await expectRefused(signedIn("cass").firestore().doc(path).get(), "Cass reading Bram's report");
  await expectRefused(signedOut().firestore().doc(path).get(), "a signed-out visitor reading Bram's report");
});

rule(
  { req: ["NF-13", "TF-11"], m: "M2" },
  "only an email on the invite list can create an account profile, and nobody can read the list",
  async () => {
    await seed({ "invites/bram@example.test": { addedBy: "maintainer" } });
    await expectAllowed(
      signedIn("bram").firestore().doc(`users/${bram()}`).set({ displayName: "Bramblewick" }),
      "Bram, who is invited, creating his profile",
    );
    await expectRefused(
      signedIn("cass")
        .firestore()
        .doc(`users/${uid("cass")}`)
        .set({ displayName: "Cassia Vane" }),
      "Cass, who isn't invited, creating her profile",
    );
    await expectRefused(
      signedIn("bram").firestore().doc("invites/bram@example.test").get(),
      "Bram reading the invite list",
    );
    await expectRefused(signedIn("bram").firestore().collection("invites").get(), "Bram listing the invite list");
  },
);

rule(
  { req: ["IN-15", "HI-4", "TF-11"], m: "M2" },
  "deleting an entry takes its history records with it in one batch, and only for Bram",
  async () => {
    await seedAldric();
    const entry = `${character()}/entries/aldric-sword`;
    const record = `${character()}/history/h1`;
    const cass = signedIn("cass").firestore();
    await expectRefused(
      cass.batch().delete(cass.doc(entry)).delete(cass.doc(record)).commit(),
      "Cass deleting Duskfang",
    );
    const mine = signedIn("bram").firestore();
    await expectAllowed(
      mine.batch().delete(mine.doc(entry)).delete(mine.doc(record)).commit(),
      "Bram deleting Duskfang with its record",
    );
  },
);

rule(
  { req: ["CH-6", "HI-4", "TF-11"], m: "M2" },
  "deleting a character takes its history with it in one batch, but a record whose character stays can't go",
  async () => {
    await seedAldric();
    await seed({ [`${character()}/history/h2`]: { event: "level-changed" } });
    const mine = signedIn("bram").firestore();
    await expectRefused(mine.doc(`${character()}/history/h2`).delete(), "Bram removing a level-change record alone");
    await expectAllowed(
      mine
        .batch()
        .delete(mine.doc(character()))
        .delete(mine.doc(`${character()}/history/h2`))
        .commit(),
      "Bram deleting Aldric with his level-change record",
    );
  },
);

rule({ req: ["PV-2", "TF-11"], m: "M2" }, "a profile holds only the display name and email", async () => {
  await seedAldric();
  const mine = signedIn("bram").firestore();
  await expectRefused(
    mine.doc(`users/${bram()}`).set({ realName: "Made-up Name" }, { merge: true }),
    "Bram adding a real name to his profile",
  );
  await expectRefused(mine.doc(`users/${bram()}`).set({ displayName: "" }, { merge: true }), "a blank display name");
});

rule(
  { req: ["NF-13", "TF-11"], m: "M2" },
  "a signed-in user without a profile can't store characters or titles, even in their own account",
  async () => {
    const cass = signedIn("cass").firestore();
    const mine = `users/${uid("cass")}`;
    await expectRefused(
      cass.doc(`${mine}/characters/c1`).set({ name: "Brin", className: "Rogue", level: 8 }),
      "Cass, with no profile, creating a character",
    );
    await expectRefused(
      cass.doc(`${mine}/titles/t1`).set({ name: "Made-up Title" }),
      "Cass, with no profile, adding a title",
    );
    await seed({ [mine]: { displayName: "Cassia Vane" } });
    await expectAllowed(
      cass.doc(`${mine}/characters/c1`).set({ name: "Brin", className: "Rogue", level: 8 }),
      "Cass, once she has a profile, creating a character",
    );
  },
);

rule(
  { req: ["NF-6", "TF-11"], m: "M2" },
  "records can't carry unknown fields or oversized text, so nobody can run up storage",
  async () => {
    await seedAldric();
    const mine = signedIn("bram").firestore();
    const huge = "x".repeat(20_000);
    await expectRefused(
      mine.doc(character()).set({ notes: huge }, { merge: true }),
      "Aldric with 20,000-character notes",
    );
    await expectRefused(
      mine.doc(`${character()}/entries/e2`).set({ category: "consumables", name: "Tonic", quantity: 1, junk: "x" }),
      "an entry with a made-up field",
    );
    await expectRefused(
      mine.doc(`${character()}/history/h9`).set({ event: "used", entryId: "aldric-sword", note: huge }),
      "a history record with a 20,000-character note",
    );
    await expectRefused(
      mine.doc(`users/${bram()}/titles/t2`).set({ name: "t".repeat(500) }),
      "a title with a 500-character name",
    );
    await expectRefused(
      mine.doc("listings/big").set({ ownerUid: bram(), ownerName: "Bramblewick", name: "Duskfang", description: huge }),
      "a listing with a 20,000-character description",
    );
    await expectAllowed(
      mine
        .doc(`${character()}/entries/e3`)
        .set({ category: "consumables", name: "Tonic", quantity: 1, notes: "short" }),
      "an ordinary entry",
    );
  },
);

rule(
  { req: ["IN-11", "TF-11"], m: "M3" },
  "a history record's link must be a web address starting http:// or https://",
  async () => {
    await seedAldric();
    const mine = signedIn("bram").firestore();
    const record = (link: string) => ({ event: "acquired", entryId: "aldric-sword", quantity: 1, link });
    for (const [i, link] of [
      "mailto:bram@example.test",
      "ftp://files.example.test/sword",
      "javascript:void(0)",
      "discord.example.test/channels/1/2/3",
      "https://",
    ].entries()) {
      await expectRefused(
        mine.doc(`${character()}/history/bad${i}`).set(record(link)),
        `a history record with the link ${link}`,
      );
    }
    await expectAllowed(
      mine.doc(`${character()}/history/web`).set(record("https://discord.example.test/channels/1/2/3")),
      "a history record with an https link",
    );
    await expectAllowed(
      mine.doc(`${character()}/history/web2`).set(record("HTTP://discord.example.test/channels/1/2/3")),
      "a history record with a capitalised http link",
    );
  },
);

rule({ req: ["PV-2", "TF-11"], m: "M2" }, "a profile's email is the sign-in's own email", async () => {
  await seedAldric();
  const mine = signedIn("bram").firestore();
  await expectRefused(
    mine.doc(`users/${bram()}`).set({ email: "someone.else@example.test" }, { merge: true }),
    "Bram setting someone else's email on his profile",
  );
  await expectAllowed(
    mine.doc(`users/${bram()}`).set({ email: "bram@example.test" }, { merge: true }),
    "Bram keeping his own email on his profile",
  );
});

rule(
  { req: ["PV-1", "NF-13", "TF-11"], m: "M2" },
  "a listing needs its owner's profile, and shows the owner's own display name",
  async () => {
    const listing = {
      ownerUid: uid("cass"),
      ownerName: "Cassia Vane",
      name: "Thornneedle",
      category: "weapons",
      quantity: 1,
    };
    const cass = signedIn("cass").firestore();
    await expectRefused(cass.doc("listings/c1").set(listing), "Cass, with no profile, listing Thornneedle");
    await seed({ [`users/${uid("cass")}`]: { displayName: "Cassia Vane" } });
    await expectRefused(
      cass.doc("listings/c1").set({ ...listing, ownerName: "Bramblewick" }),
      "Cass listing Thornneedle under Bram's display name",
    );
    await expectAllowed(cass.doc("listings/c1").set(listing), "Cass listing Thornneedle under her own name");
  },
);

rule({ req: ["PV-1", "TF-11"], m: "M2" }, "a listing can't be handed to another user", async () => {
  await seed({
    "listings/l1": { ownerUid: bram(), ownerName: "Bramblewick", name: "Duskfang", category: "weapons", quantity: 1 },
  });
  await expectRefused(
    signedIn("bram")
      .firestore()
      .doc("listings/l1")
      .update({ ownerUid: uid("cass") }),
    "Bram giving his listing to Cass",
  );
});

// ---------------------------------------------------------------- writes nobody else may make (TF-11)

rule(
  { req: ["PV-1", "HI-4", "TF-11"], m: "M2" },
  "only Bram can add a record to Aldric's history; Cass and a signed-out visitor can't",
  async () => {
    await seedAldric();
    const record = { event: "used", entryId: "aldric-sword", quantity: 1 };
    await expectRefused(
      signedIn("cass").firestore().doc(`${character()}/history/planted`).set(record),
      "Cass adding a record to Aldric's history",
    );
    await expectRefused(
      signedOut().firestore().doc(`${character()}/history/planted`).set(record),
      "a signed-out visitor adding a record to Aldric's history",
    );
    await expectAllowed(
      signedIn("bram").firestore().doc(`${character()}/history/mine`).set(record),
      "Bram adding a record to Aldric's history",
    );
  },
);

rule(
  { req: ["SP-1", "SP-2", "TF-11"], m: "M3" },
  "nobody else can send, change or delete Bram's reports, and once sent Bram can't change one either",
  async () => {
    await seedAldric();
    const reports = `users/${bram()}/reports`;
    const report = {
      number: 12345678,
      kind: "bug",
      subject: "Totals",
      message: "The CM looked wrong.",
      delivery: "pending",
    };
    await seed({ [`${reports}/r1`]: report });
    for (const [who, db] of [
      ["Cass", signedIn("cass").firestore()],
      ["a signed-out visitor", signedOut().firestore()],
    ] as const) {
      await expectRefused(db.doc(`${reports}/r2`).set(report), `${who} sending a report in Bram's name`);
      await expectRefused(db.doc(`${reports}/r1`).update({ message: "Changed." }), `${who} changing Bram's report`);
      await expectRefused(db.doc(`${reports}/r1`).delete(), `${who} deleting Bram's report`);
    }
    const mine = signedIn("bram").firestore();
    await expectRefused(
      mine.doc(`${reports}/r1`).update({ delivery: "issue-created" }),
      "Bram marking his own report delivered",
    );
    await expectRefused(
      mine.doc(`${reports}/r1`).update({ message: "A new message after sending." }),
      "Bram changing his report's message after sending it",
    );
    await expectAllowed(mine.doc(`${reports}/r3`).set(report), "Bram sending another report");
  },
);

rule(
  { req: ["NF-13", "TF-11"], m: "M2" },
  "no signed-in user can add to, change or remove the invite list, not even their own email",
  async () => {
    await seed({ "invites/bram@example.test": { addedBy: "maintainer" } });
    const cass = signedIn("cass").firestore();
    await expectRefused(cass.doc("invites/cass@example.test").set({ addedBy: "cass" }), "Cass inviting herself");
    await expectRefused(
      cass.doc(`users/${uid("cass")}`).set({ displayName: "Cassia Vane" }),
      "Cass, still not invited, creating her profile",
    );
    const mine = signedIn("bram").firestore();
    await expectRefused(mine.doc("invites/bram@example.test").set({ addedBy: "bram" }), "Bram changing his own invite");
    await expectRefused(mine.doc("invites/bram@example.test").delete(), "Bram removing his own invite");
    await expectRefused(mine.doc("invites/wren@example.test").set({ addedBy: "bram" }), "Bram inviting someone else");
    await expectAllowed(
      mine.doc(`users/${bram()}`).set({ displayName: "Bramblewick" }),
      "Bram, who is invited, creating his profile",
    );
  },
);

rule(
  { req: ["PV-1", "PV-3", "TF-11"], m: "M2" },
  "nobody can query a kind of record across every user's account",
  async () => {
    await seedAldric();
    await seed({ [`users/${bram()}/reports/r1`]: { kind: "bug", subject: "Totals", message: "The CM looked wrong." } });
    for (const [who, db] of [
      ["Cass", signedIn("cass").firestore()],
      ["Bram", signedIn("bram").firestore()],
    ] as const) {
      for (const group of ["characters", "entries", "history", "titles", "reports"]) {
        await expectRefused(db.collectionGroup(group).get(), `${who} querying every account's ${group}`);
      }
    }
    await expectAllowed(
      signedIn("bram").firestore().collection(`${character()}/entries`).get(),
      "Bram listing Aldric's entries",
    );
  },
);

rule(
  { req: ["PV-1", "TF-11"], m: "M2" },
  "Bram can't change his listing to carry notes or the character's name",
  async () => {
    await seedListingOwner();
    await seed({
      "listings/l1": { ownerUid: bram(), ownerName: "Bramblewick", name: "Duskfang", category: "weapons", quantity: 1 },
    });
    const mine = signedIn("bram").firestore();
    await expectRefused(mine.doc("listings/l1").update({ notes: "Private note" }), "Bram adding notes to his listing");
    await expectRefused(
      mine.doc("listings/l1").update({ characterName: "Aldric" }),
      "Bram adding Aldric's name to his listing",
    );
    await expectAllowed(mine.doc("listings/l1").update({ quantity: 2 }), "Bram changing his listing's quantity");
  },
);

// ---------------------------------------------------------------- the app's limits are the server's (NF-6)

/** A value of exactly `max` characters is allowed and one more is refused. */
async function atTheLimit(what: string, max: number, write: (value: string, attempt: string) => Promise<unknown>) {
  await expectAllowed(write("x".repeat(max), "ok"), `${what} of ${max} characters`);
  await expectRefused(write("x".repeat(max + 1), "over"), `${what} of ${max + 1} characters`);
}

rule(
  { req: ["NF-6", "TF-11"], m: "M2" },
  "the server's size limits on profiles, characters, entries and titles are the app's",
  async () => {
    await seedAldric();
    const mine = signedIn("bram").firestore();
    await atTheLimit("Bram's display name", LIMITS.displayName, (displayName) =>
      mine.doc(`users/${bram()}`).set({ displayName }, { merge: true }),
    );
    for (const field of ["name", "notes"] as const) {
      await atTheLimit(`a character's ${field}`, LIMITS[field], (value, n) =>
        mine
          .doc(`users/${bram()}/characters/${field}-${n}`)
          .set({ name: "Wren", className: "Rogue", level: 1, [field]: value }),
      );
    }
    for (const [field, max] of [
      ["name", LIMITS.name],
      ["description", LIMITS.description],
      ["notes", LIMITS.notes],
      ["itemFamily", LIMITS.shortText],
      ["weaponGroup", LIMITS.shortText],
      ["allyType", LIMITS.shortText],
      ["tier", LIMITS.shortText],
    ] as const) {
      await atTheLimit(`an entry's ${field}`, max, (value, n) =>
        mine
          .doc(`${character()}/entries/${field}-${n}`)
          .set({ category: "consumables", name: "Tonic", quantity: 1, [field]: value }),
      );
    }
    for (const [field, max] of [
      ["name", LIMITS.name],
      ["description", LIMITS.description],
    ] as const) {
      await atTheLimit(`a title's ${field}`, max, (value, n) =>
        mine.doc(`users/${bram()}/titles/${field}-${n}`).set({ name: "Made-up Title", [field]: value }),
      );
    }
  },
);

rule(
  { req: ["NF-6", "IN-11", "SP-1", "TF-11"], m: "M3" },
  "the server's size limits on history notes, sources, links and reports are the app's",
  async () => {
    await seedAldric();
    const mine = signedIn("bram").firestore();
    const record = { event: "acquired", entryId: "aldric-sword", quantity: 1 };
    await atTheLimit("a history note", LIMITS.notes, (note, n) =>
      mine.doc(`${character()}/history/note-${n}`).set({ ...record, note }),
    );
    await atTheLimit("a history source", LIMITS.shortText, (source, n) =>
      mine.doc(`${character()}/history/source-${n}`).set({ ...record, source }),
    );
    const site = "https://example.test/";
    await atTheLimit("a history link", LIMITS.link, (padding, n) =>
      mine.doc(`${character()}/history/link-${n}`).set({ ...record, link: site + padding.slice(site.length) }),
    );
    const report = { kind: "bug", subject: "Totals", message: "The CM looked wrong." };
    await atTheLimit("a report subject", LIMITS.reportSubject, (subject, n) =>
      mine.doc(`users/${bram()}/reports/subject-${n}`).set({ ...report, subject }),
    );
    await atTheLimit("a report message", LIMITS.reportMessage, (message, n) =>
      mine.doc(`users/${bram()}/reports/message-${n}`).set({ ...report, message }),
    );
  },
);
