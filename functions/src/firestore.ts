// The server's report records in Cloud Firestore (src/server/reports.ts's
// DeliveryStore). `reportQueue/` and `reportCounts/` are written only here: the
// security rules give users no access to them.

import { Timestamp, type Firestore } from "firebase-admin/firestore";
import type { Report } from "../../src/data/types";
import {
  counterExpiry,
  type DeliveryStore,
  type QueueEntry,
  type ReportCounter,
  type ReportRef,
} from "../../src/server/reports";

/** gRPC's NOT_FOUND. */
const NOT_FOUND = 5;

export function firestoreDeliveryStore(db: Firestore): DeliveryStore {
  const reportDoc = (ref: ReportRef) => db.doc(`users/${ref.uid}/reports/${ref.id}`);
  const queueDoc = (ref: ReportRef) => db.doc(`reportQueue/${ref.uid}_${ref.id}`);

  return {
    async report(ref) {
      const snap = await reportDoc(ref).get();
      return snap.exists ? ({ ...snap.data(), id: ref.id, uid: ref.uid } as Report) : undefined;
    },

    async displayName(uid) {
      const name: unknown = (await db.doc(`users/${uid}`).get()).get("displayName");
      return typeof name === "string" ? name : undefined;
    },

    async saveDelivery(ref, result) {
      try {
        await reportDoc(ref).update(result);
      } catch (e) {
        // The account was deleted meanwhile: nothing to mark.
        if ((e as { code?: unknown }).code !== NOT_FOUND) throw e;
      }
    },

    updateCounter(uid, change) {
      const doc = db.doc(`reportCounts/${uid}`);
      return db.runTransaction(async (tx) => {
        const data = (await tx.get(doc)).data();
        const next = change(data && { day: String(data.day), ids: (data.ids as string[]) ?? [] });
        // A TTL policy on expireAt removes the counter once its day is over (docs/maintainer.md).
        const expireAt = Timestamp.fromDate(counterExpiry(next.day));
        tx.set(doc, { ...next, expireAt } satisfies ReportCounter & { expireAt: Timestamp });
        return next;
      });
    },

    updateQueue(ref, change) {
      const doc = queueDoc(ref);
      return db.runTransaction(async (tx) => {
        const data = (await tx.get(doc)).data();
        const before: QueueEntry | undefined =
          data && (typeof data.leaseUntil === "string" ? { leaseUntil: data.leaseUntil } : {});
        const next = change(before);
        if (next === undefined) tx.delete(doc);
        else tx.set(doc, { uid: ref.uid, id: ref.id, ...next });
        return next;
      });
    },

    async queued() {
      const snap = await db.collection("reportQueue").get();
      return snap.docs.map((d) => ({ uid: String(d.get("uid")), id: String(d.get("id")) }));
    },
  };
}
