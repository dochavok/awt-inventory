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
  { req: ["NF-13", "TF-11"], m: "M3" },
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
