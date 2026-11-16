// AWT Inventory's Cloud Functions (requirements section 20). The logic is in
// src/server/, shared with the tests; this file wires it to Firebase.
//
// - onReportCreated: a new report is counted (SP-1) and delivered (SP-2, SP-3);
// - retryReports: every hour, reports that couldn't be delivered are tried again;
// - nightlyBackup: the database is exported to the backup project (NF-10).

import { initializeApp } from "firebase-admin/app";
import { getFirestore, v1 } from "firebase-admin/firestore";
import { setGlobalOptions } from "firebase-functions/v2";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { systemClock } from "../../src/platform/clock";
import { BACKUP_SCHEDULE, backupPlan, exportRequest } from "../../src/server/backup";
import { gitHubIssues } from "../../src/server/github";
import { resendMailer } from "../../src/server/mail";
import { receiveReport, retryQueued, type ServerDelivery } from "../../src/server/reports";
import {
  BACKUP,
  GITHUB_APP_PRIVATE_KEY,
  MAINTAINER_EMAIL,
  REGION,
  RESEND_API_KEY,
  RUNTIME_SERVICE_ACCOUNT,
} from "./config";
import { firestoreDeliveryStore } from "./firestore";

initializeApp();

// A few instances at most, so a flood of events can't run up costs (NF-6). The
// functions run as their own service account, with only the roles they need
// (docs/maintainer.md), not the project's broad default one.
setGlobalOptions({ region: REGION, maxInstances: 2, serviceAccount: RUNTIME_SERVICE_ACCOUNT });

const secrets = [GITHUB_APP_PRIVATE_KEY, RESEND_API_KEY, MAINTAINER_EMAIL];

/** Built per call: secrets can be read only while a function runs. */
function delivery(): ServerDelivery {
  return {
    issues: gitHubIssues(GITHUB_APP_PRIVATE_KEY.value(), { fetch, now: () => systemClock.now() }),
    mailer: resendMailer(RESEND_API_KEY.value(), { fetch }),
    maintainerEmail: MAINTAINER_EMAIL.value(),
    store: firestoreDeliveryStore(getFirestore()),
    clock: systemClock,
  };
}

export const onReportCreated = onDocumentCreated({ document: "users/{uid}/reports/{reportId}", secrets }, (event) =>
  receiveReport({ uid: event.params.uid, id: event.params.reportId }, delivery()),
);

export const retryReports = onSchedule({ schedule: "every 60 minutes", timeZone: "UTC", secrets }, () =>
  retryQueued(delivery()),
);

export const nightlyBackup = onSchedule({ schedule: BACKUP_SCHEDULE, timeZone: "UTC" }, async () => {
  const appProject = process.env.GCLOUD_PROJECT;
  if (!appProject) throw new Error("GCLOUD_PROJECT isn't set");
  const plan = backupPlan({ appProject, ...BACKUP });
  // Waits only for the export to start; Firestore finishes it on its own.
  await new v1.FirestoreAdminClient().exportDocuments(exportRequest(plan, appProject, new Date()));
});
