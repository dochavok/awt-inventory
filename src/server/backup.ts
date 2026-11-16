// Nightly backups (NF-10): a Firestore export to a bucket in a separate Google
// Cloud project, deleted after 30 days. M1 stub.

import { NotImplementedError } from "../errors";

export interface BackupPlan {
  /** Cloud Scheduler syntax, e.g. "every 24 hours". */
  schedule: string;
  /** The project the bucket lives in: never the app's own. */
  bucketProject: string;
  bucket: string;
  retentionDays: number;
  /** Google-managed or customer-managed; never unencrypted. */
  encryption: "google-managed" | "customer-managed";
}

export function backupPlan(_env: { appProject: string; backupProject: string; bucket: string }): BackupPlan {
  throw NotImplementedError.stub("backupPlan", "M3");
}

/** The Firestore export request for one night: the whole database, into that day's folder in the bucket. */
export interface ExportRequest {
  name: string;
  outputUriPrefix: string;
  collectionIds: string[];
}

export function exportRequest(_plan: BackupPlan, _appProject: string, _at: Date): ExportRequest {
  throw NotImplementedError.stub("exportRequest", "M3");
}
