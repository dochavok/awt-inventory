// The data layer on Cloud Firestore, with its offline cache (TF-2, NF-3). Same
// interface as the in-memory store. M1 stub.

import { NotImplementedError } from "../errors";
import type { InventoryStore, StoreContext } from "./store";

/**
 * `firestore` is a Firestore instance for the signed-in user (in tests, one
 * from the emulator). The layout is the one tests/access/privacy.test.ts fixes.
 */
export function createFirestoreStore(_firestore: unknown, _context: StoreContext): InventoryStore {
  throw new NotImplementedError("createFirestoreStore", "M2");
}
