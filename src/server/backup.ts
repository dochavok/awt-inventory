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
  throw new NotImplementedError("backupPlan", "M3");
}
