// Where the Cloud Functions run and what they use. IDs only: the secrets are in
// Google Cloud's Secret Manager, set as docs/maintainer.md says.

import { defineSecret } from "firebase-functions/params";

/** The same region as the Firestore database (us-east4), so triggers and exports stay close to it. */
export const REGION = "us-east4";

/** The functions' own service account in the app's project ("name@" is short for name@PROJECT.iam.gserviceaccount.com). */
export const RUNTIME_SERVICE_ACCOUNT = "awt-functions@";

/** NF-10: the backup project and its bucket, separate from the app's project. */
export const BACKUP = { backupProject: "awt-inventory-backup", bucket: "awt-inventory-backups" };

/** SP-2: the GitHub App's private key (PEM). */
export const GITHUB_APP_PRIVATE_KEY = defineSecret("GITHUB_APP_PRIVATE_KEY");
/** SP-3: Resend's API key, sending access only. */
export const RESEND_API_KEY = defineSecret("RESEND_API_KEY");
/** SP-3: the maintainer's address, the one the Resend account was made with. Kept out of the public repository. */
export const MAINTAINER_EMAIL = defineSecret("MAINTAINER_EMAIL");
