// Nightly backups (NF-10): a Firestore export to a bucket in a separate Google
// Cloud project. The bucket's lifecycle rule (docs/backup-lifecycle.json)
// deletes each export after `retentionDays`; the restore runbook is
// docs/restore-runbook.md.

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

/** Cloud Scheduler runs the export at 03:00 UTC (the function sets the time zone), late evening on the US east coast. */
export const BACKUP_SCHEDULE = "every day 03:00";

export function backupPlan(env: { appProject: string; backupProject: string; bucket: string }): BackupPlan {
  if (env.backupProject === env.appProject) throw new Error("Backups must go to a project other than the app's");
  return {
    schedule: BACKUP_SCHEDULE,
    bucketProject: env.backupProject,
    bucket: env.bucket,
    retentionDays: 30,
    // Cloud Storage encrypts everything it stores with Google-managed keys unless told otherwise.
    encryption: "google-managed",
  };
}

/** The Firestore export request for one night: the whole database, into that day's folder in the bucket. */
export interface ExportRequest {
  name: string;
  outputUriPrefix: string;
  collectionIds: string[];
}

export function exportRequest(plan: BackupPlan, appProject: string, at: Date): ExportRequest {
  return {
    name: `projects/${appProject}/databases/(default)`,
    outputUriPrefix: `gs://${plan.bucket}/${at.toISOString().slice(0, 10)}`,
    // Every collection.
    collectionIds: [],
  };
}
