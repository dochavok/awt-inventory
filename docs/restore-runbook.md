# Restore runbook

For the maintainer only (NF-10); not part of the in-app guide.

Restore tested: not yet

## The two kinds of backup

| | NF-10's nightly export | Firestore's built-in backups |
|---|---|---|
| What | A Firestore export of the whole database, by the `nightlyBackup` Cloud Function at 03:00 UTC | Firestore's own daily backup |
| Where | Bucket `gs://awt-inventory-backups` in the separate project `awt-inventory-backup`, one folder per day (`2026-11-20/`) | Inside the app's project `awt-inventory` |
| Kept | 30 days (the bucket's lifecycle rule, `docs/backup-lifecycle.json`) | 7 days |
| Survives | The app's project being damaged or deleted | Mistakes in the data |
| Restores to | Any database, the live one included | A new database only |

Both are encrypted by Google with Google-managed keys.

Run everything below in **Cloud Shell** (console.cloud.google.com, the `>_` button), signed in as the project owner. Start each session with:

```bash
APP=awt-inventory
BUCKET=awt-inventory-backups
REGION=us-east4
```

## 1. Check the backups are there

```bash
gcloud storage ls gs://$BUCKET/
gcloud firestore backups list --project $APP --location $REGION
```

The newest export folder should be from today or yesterday (UTC). If it isn't, read the `nightlyBackup` function's logs: Firebase console → Functions → `nightlyBackup` → Logs.

## 2. Restore into a new database and check it

Always restore into a new database first, check it, and only then touch the live one.

From a nightly export (pick the day's folder from step 1):

```bash
DAY=2026-11-20
gcloud firestore databases create --project $APP --database restore-check --location $REGION
gcloud firestore import gs://$BUCKET/$DAY --project $APP --database restore-check
```

Or from a built-in backup (the backup's full name comes from `backups list`):

```bash
gcloud firestore databases restore --project $APP \
  --source-backup projects/$APP/locations/$REGION/backups/BACKUP_ID \
  --destination-database restore-check
```

Then open Firestore in the console, switch to the `restore-check` database, and check that the records you expect are there (a player's characters under `users/`, the `invites` list).

## 3. Put the data back into the live database

Only once step 2 looks right, and with the app closed to players if possible (tell them first; Craig's call):

```bash
gcloud firestore import gs://$BUCKET/$DAY --project $APP --database "(default)"
```

An import **overwrites** each document that's in the export and **leaves alone** documents added since. So a record deleted by mistake comes back, but one created after the backup stays. To go back exactly to the backup, delete the affected collections first (console, or `gcloud firestore bulk-delete`), then import.

A built-in backup can't be restored over the live database: copy from `restore-check` by exporting it (`gcloud firestore export gs://$BUCKET/from-restore-check --database restore-check`) and importing that as above.

## 4. Tidy up

```bash
gcloud firestore databases delete --project $APP --database restore-check
```

A second database costs a little while it exists, so don't leave it.

## Testing the restore

NF-10 asks for a restore to be tested before the first release, and again whenever this runbook changes:

1. In the console, add a made-up document to the live database: collection `restoreTest`, document `check`, field `note` = `made-up restore test`.
2. Make an export now, as the nightly function would:
   `gcloud firestore export gs://$BUCKET/restore-test-$(date -u +%F) --project $APP`
3. Follow step 2 with that folder, and check `restoreTest/check` is in `restore-check`.
4. Delete `restore-check` (step 4), the `restoreTest` collection, and the test folder: `gcloud storage rm -r gs://$BUCKET/restore-test-*`.
5. In a pull request, replace "not yet" (or the old date) on the line at the top with that day's date, written as YYYY-MM-DD.
