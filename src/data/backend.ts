// What a store keeps its records in, for the signed-in user only: the
// in-memory database in tests, Cloud Firestore in the app. The logic that
// decides what to read and change is shared (records.ts), so the data-layer
// tests check the same code the app runs.
//
// Reads return the user's own records. Something that exists but belongs to
// someone else is "not-mine"; a backend that can't tell (Firestore, where
// another user's records are out of reach) says it doesn't exist.
//
// Writes are lists of changes. A backend applies each list as one unit where it
// can, and may send it later (Firestore without signal, NF-3).

import type { Character, Entry, Id, Title } from "../rules/types";
import type { HistoryRecord, Profile, Report, SyncStatus } from "./types";

export type NotMine = "not-mine";

/** A history record with its place in the order records were made (HI-1). */
export interface StoredRecord {
  seq: number;
  record: HistoryRecord;
}

export type RecordKind = "character" | "entry" | "history" | "title" | "report";

export type Change =
  | { op: "set-character"; value: Character }
  | { op: "set-entry"; value: Entry }
  | { op: "set-history"; value: StoredRecord }
  | { op: "set-title"; value: Title }
  | { op: "set-report"; value: Report }
  /**
   * Changes fields of a record; an undefined value removes the field. `at` is
   * when the change was made: if two devices change the same field, the later
   * change wins, whichever reaches the server last (NF-3).
   */
  | { op: "update"; kind: "character" | "entry" | "title"; id: Id; fields: Record<string, unknown>; at: string }
  /** Adds to (or with a negative `by`, takes from) an entry's quantity, so changes on two devices add up (NF-3). */
  | { op: "add-quantity"; entryId: Id; by: number }
  | { op: "delete"; kind: RecordKind; id: Id }
  /**
   * A character's name, ignoring case, taken by that character: written with
   * the character or its new name, so that two phones that each give a
   * character the same name offline can't both keep it (NF-3, CH-1).
   */
  | { op: "claim-name"; name: string; characterId: Id }
  | { op: "release-name"; name: string };

export interface Backend {
  /** A new, unique ID for a record. Entries and history records belong to `characterId`. */
  newId(kind: RecordKind, characterId?: Id): Id;
  /** A number above every earlier one from this backend, to keep history records in order (HI-1). */
  nextSeq(): number;

  profile(): Promise<Profile | undefined>;
  /** Waits for the server: creating a profile needs signal (NF-3) and may be refused (NF-13). */
  createProfile(profile: Profile): Promise<void>;
  setDisplayName(displayName: string): Promise<void>;
  /** AC-5: removes everything in the account. */
  deleteAccount(): Promise<void>;

  characters(): Promise<Character[]>;
  character(id: Id): Promise<Character | NotMine | undefined>;
  /** A character's entries, including ones at quantity 0 (kept so a restore can bring them back, IN-13). */
  entries(characterId: Id): Promise<Entry[]>;
  entry(id: Id): Promise<Entry | NotMine | undefined>;
  history(characterId: Id): Promise<StoredRecord[]>;
  historyRecord(id: Id): Promise<StoredRecord | NotMine | undefined>;
  titles(): Promise<Title[]>;
  title(id: Id): Promise<Title | NotMine | undefined>;
  reports(): Promise<Report[]>;
  /** A number for a new report, different from every other report's (SP-1). */
  reportNumber(): number;

  write(changes: Change[]): Promise<void>;
  syncStatus(): Promise<SyncStatus>;
}
