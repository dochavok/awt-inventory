# Maintainer guide

For the maintainer only (DOC-5); not part of the in-app guide. Every recurring
task, with its steps or a link to them.

## The setup at a glance

| What | Where |
|---|---|
| The app | `https://awt-inventory.web.app`, Firebase project `awt-inventory` (Blaze plan), region `us-east4` |
| Database | Cloud Firestore, `(default)` database, `us-east4` |
| Server code | Cloud Functions in `functions/` (`onReportCreated`, `retryReports`, `nightlyBackup`), running as the service account `awt-functions` |
| Backups | Project `awt-inventory-backup`, bucket `awt-inventory-backups`: see [restore-runbook.md](restore-runbook.md) |
| Error reports | Sentry, organization `craig-vogel`, project `awt-inventory` |
| Player reports | Private repository `dochavok/awt-inventory-reports`, through the GitHub App "AWT Inventory Reports"; account problems by email through Resend |
| Deploys | `.github/workflows/deploy.yml`, through the `production` environment |

Every account, its cost and where its secrets are kept is recorded in the
brain's `services.md`, never here.

## Costs

Costs are recorded in the brain's `services.md` (NF-5): update it when a cost
changes. A budget alert at $5 a month is set on the billing account (Google
Cloud console → Billing → Budgets & alerts), covering both projects, with
promotional credits left out so it tracks real use. If the alert fires, check
Billing → Reports for which service grew.

## Deploying

Merging a pull request to `main` is deploying to production: CI runs on `main`,
and once it passes, the Deploy workflow builds the app with the `production`
environment's settings and runs `firebase deploy` for the app, the Cloud
Functions and the Firestore rules. Watch it in the repository's Actions tab.

To undo a bad release, revert its pull request: the revert deploys the same
way. A change to the database's shape can't be undone by a revert alone; see
[restore-runbook.md](restore-runbook.md).

The `production` environment holds:

| Kind | Name | What |
|---|---|---|
| Variable | `VITE_FIREBASE_API_KEY` | The web app's config (Firebase console → Project settings → Your apps). Identifies the project; not a secret |
| Variable | `VITE_FIREBASE_AUTH_DOMAIN` | Same place, `authDomain` |
| Variable | `VITE_FIREBASE_PROJECT_ID` | Same place, `projectId` |
| Variable | `VITE_FIREBASE_APP_ID` | Same place, `appId` |
| Variable | `VITE_SENTRY_DSN` | Sentry → project settings → Client Keys (DSN). Not a secret |
| Secret | `GCP_WORKLOAD_IDENTITY_PROVIDER` | The Workload Identity provider's full name (one-time setup, below) |
| Secret | `GCP_DEPLOY_SERVICE_ACCOUNT` | `github-deploy@awt-inventory.iam.gserviceaccount.com` |

## Changing reference data, and rebuilding the skill list

The reference data is the YAML in `data/`: level chart, slot kinds, rarities,
suggestions, skills and skill grants. Change it by pull request; CI checks
every file (RD-4). An entry leaving the game is marked `retired: true`, never
deleted (RD-3). Raising the level cap means adding rows to `level-chart.yaml`
(RD-5).

The skill list (`data/skills.yaml`) is the app's own source (RD-6): it was
built on 2026-11-17 from the updated skill sheets. Change a skill there, by
pull request, never by rebuilding it from the Warrior, Rogue and Mage
artifacts: the file is the source, and keeping the artifacts in step with
it is a separate task. The game's owner agreed (Q10) to the card text and the level chart's
numbers being kept in this public repository; they remain the owner's (RD-8).

Card text is shown in the app while `SHOW_SKILL_TEXT` is `true` in
`src/app/settings.ts`. To turn it off (for example, if the owner withdraws
agreement), set it to `false` and deploy: skills are then shown without their
text, and the printable sheet can't include it (SK-2). In the same pull
request, update the guide pages that promise card text (`docs/skills.md`,
`docs/search-and-export.md`). The browser test "a skill taken shows its card
text from the skill list" (SK-2) then fails, and CI blocks the deploy, so
change SK-2 and that test first, by the test-change rule (TF-6). Turning it
off only hides the text: if the owner
also wants the game content out of this repository, that changes RD-8, so
agree the requirement first (the browser tests read skills from `data/`).

## Managing the invite list

Until release 1.0, only invited email addresses can sign up (NF-13). The list
is the `invites` collection in Firestore: one document per address, its ID the
email address in lower case (fields don't matter; add `added` with the date).

- **Invite:** Firebase console → Firestore → `invites` → Add document, with the
  address in lower case as the document ID.
- **Remove:** delete that document. It stops new sign-ups with that address;
  an account already made stays.

## Applying a DM's answer

When a DM answers a question in `dm-rule-questions.md`, follow the test-change
rule (TF-6) from step 2 in `CLAUDE.md`: fix the requirements to say how the app
should behave, fix the tests that depend on the question (they name it, e.g.
`Q1`), commit both together naming the requirement, then fix the code. Move the
question to the answered list with the answer and the date.

## Reviewing Dependabot pull requests

Dependabot opens weekly pull requests for the root packages, the Cloud
Functions' packages (`functions/`) and the GitHub Actions; minor and patch
updates come grouped, major updates one at a time. Batch the open ones into one
pull request so `main` deploys once, and let CI run every check on it. Read a
major update's release notes before merging; close it if it isn't wanted yet
(for example TypeScript 7 waits for a typescript-eslint that supports it).

Security alerts arrive on their own. If the flaw is in code the app doesn't run
(a test tool, or a server-side flaw in a package used only as a client),
dismiss it as "vulnerable code not used" and record why in the brain.

## Checking the app is running, and reading its error reports

- **The app:** open `https://awt-inventory.web.app` and sign in.
- **Error reports (NF-12):** Sentry → Issues, project `awt-inventory`. Each
  issue is an error from players' phones, scrubbed of game records, names and
  email addresses. Refusals players are shown (a full slot, a name in use) are
  never reported; a change the server refused while syncing is.
- **Server errors:** Firebase console → Functions → a function → Logs, or
  Google Cloud console → Error Reporting. The functions never log report text.
- **Deploys:** the repository's Actions tab, workflow "Deploy".

## Backups and restoring

The database is exported every night at 03:00 UTC to the backup project and
kept 30 days; Firestore's built-in daily backups are kept 7 days as well. How
to check them, restore and test a restore: [restore-runbook.md](restore-runbook.md).

## Renewing secrets

None of the secrets expire. Replace one if it may have leaked, and when an
account changes. They're kept in Google Cloud's Secret Manager in the app's
project:

| Secret | What | From |
|---|---|---|
| `GITHUB_APP_PRIVATE_KEY` | The GitHub App's private key (`.pem`) | GitHub → Settings → Developer settings → GitHub Apps → AWT Inventory Reports → Private keys |
| `RESEND_API_KEY` | Resend API key `awt-inventory`, sending access only | Resend → API Keys |
| `MAINTAINER_EMAIL` | Where account-problem emails go | Must be the address the Resend account was made with: Resend sends from its shared address only to that one |

To replace one, from a PowerShell window in the repository folder (the value is
read from a file, so it never goes through the clipboard or history):

```powershell
npx firebase functions:secrets:set GITHUB_APP_PRIVATE_KEY --data-file "C:\path\to\new-key.pem" --project awt-inventory
```

Then re-run the latest Deploy workflow run (Actions → Deploy → Re-run jobs), so
the functions pick up the new version, delete the file, and revoke the old key
at its source (GitHub: delete the old private key; Resend: delete the old API
key). `npx firebase functions:secrets:prune --project awt-inventory` removes
versions no function uses any more. Record the change in `services.md`.

The deploy itself has no secret to renew: GitHub signs in to Google Cloud
through Workload Identity Federation.

## Answering reports

Players send reports from the app (SP-1), at most 15 a day; the server checks the
limit too, and marks reports over it `not-sent` without passing them on.

- **Missing or wrong skills, bugs and ideas (SP-2)** become issues in the
  private repository `dochavok/awt-inventory-reports`, labelled with their kind.
  An issue leaves out the player's email address and display name. Answer by
  fixing the data or the code by pull request; close the issue when it's
  released. Players aren't told through GitHub: they never see the repository.
- **Account problems (SP-3)** come by email from `onboarding@resend.dev`,
  holding only the report number. Add that sender to your contacts so it isn't
  filed as spam.
- **Reading a full report:** the email or issue gives only the report number.
  Firebase console → Firestore Database → switch from Panel View to **Query
  Builder** (Panel View doesn't list reports). Query the collection group
  `reports`, add a **WHERE** clause with field `number`, type **number** (not
  string), and the report number as the value. The result's path is
  `users/{uid}/reports/{id}`, and `{uid}` is the sender. Their `users/{uid}`
  document has their display name and email for a reply. Authentication →
  Users, searched by that uid, shows how they sign in and when they last did.
  Look only for support the player asked for (PV-3).
- **A report that wasn't delivered** (GitHub or Resend down) waits in
  `reportQueue` and is retried every hour. One that stays there for a day
  points to a broken secret or account: read `retryReports`' logs. "GitHub
  refused POST /repos/…/issues: 404" means the App isn't installed on
  `awt-inventory-reports` (GitHub → Settings → Applications → AWT Inventory
  Reports → Configure → Repository access: only that repository).

## Updating the guide

The in-app guide is the Markdown in `docs/` (everything except this file and
the restore runbook). When a pull request changes how the app behaves, update
the pages that describe it in the same pull request (DOC-3). Examples of the
app's output are generated from the sample character in `docs/sample/`: run
`npm run docs:write` and commit the result; CI fails if they're stale (DOC-4).
After checking a whole page against the app, set its `reviewed:` line to that
day (DOC-6).

## One-time setup

Done once when the project was created (M3), and kept here to rebuild it. Run
in Cloud Shell as the project owner.

```bash
APP=awt-inventory
BACKUP=awt-inventory-backup
BUCKET=awt-inventory-backups
REGION=us-east4
REPO=dochavok/awt-inventory
APP_NUMBER=$(gcloud projects describe $APP --format='value(projectNumber)')
FUNCTIONS_SA=awt-functions@$APP.iam.gserviceaccount.com
DEPLOY_SA=github-deploy@$APP.iam.gserviceaccount.com
COMPUTE_SA=$APP_NUMBER-compute@developer.gserviceaccount.com
```

**1. APIs**

```bash
gcloud services enable --project $APP \
  cloudfunctions.googleapis.com run.googleapis.com cloudbuild.googleapis.com \
  artifactregistry.googleapis.com eventarc.googleapis.com pubsub.googleapis.com \
  cloudscheduler.googleapis.com secretmanager.googleapis.com firestore.googleapis.com \
  firebaserules.googleapis.com firebasehosting.googleapis.com firebaseextensions.googleapis.com \
  iamcredentials.googleapis.com sts.googleapis.com cloudresourcemanager.googleapis.com \
  cloudbilling.googleapis.com
gcloud services enable --project $BACKUP storage.googleapis.com
```

**2. The functions' service account**, with only what the functions use:

```bash
gcloud iam service-accounts create awt-functions --project $APP \
  --display-name "AWT Inventory Cloud Functions"
sleep 60  # a new account takes a minute before roles can be granted to it
for role in roles/datastore.user roles/datastore.importExportAdmin roles/eventarc.eventReceiver \
            roles/run.invoker roles/logging.logWriter; do
  gcloud projects add-iam-policy-binding $APP --member serviceAccount:$FUNCTIONS_SA \
    --role $role --condition None --quiet > /dev/null
done
```

Bindings `firebase deploy` checks for on a first Cloud Functions deploy (it
can't add them itself, by design):

```bash
gcloud beta services identity create --service pubsub.googleapis.com --project $APP
sleep 60
gcloud projects add-iam-policy-binding $APP --condition None --quiet > /dev/null \
  --member serviceAccount:service-$APP_NUMBER@gcp-sa-pubsub.iam.gserviceaccount.com \
  --role roles/iam.serviceAccountTokenCreator
for role in roles/run.invoker roles/eventarc.eventReceiver; do
  gcloud projects add-iam-policy-binding $APP --member serviceAccount:$COMPUTE_SA \
    --role $role --condition None --quiet > /dev/null
done
```

**3. The backup bucket**, in the backup project, deleting exports after 30 days;
Firestore's service agent writes the exports:

```bash
gcloud storage buckets create gs://$BUCKET --project $BACKUP --location $REGION \
  --uniform-bucket-level-access --public-access-prevention
# The committed rule (docs/backup-lifecycle.json), from the branch or main
curl -fsSL -o backup-lifecycle.json \
  https://raw.githubusercontent.com/$REPO/${REF:-main}/docs/backup-lifecycle.json
gcloud storage buckets update gs://$BUCKET --lifecycle-file backup-lifecycle.json
gcloud beta services identity create --service firestore.googleapis.com --project $APP
sleep 60
gcloud storage buckets add-iam-policy-binding gs://$BUCKET --role roles/storage.admin \
  --member serviceAccount:service-$APP_NUMBER@gcp-sa-firestore.iam.gserviceaccount.com
```

**4. Firestore settings:** report numbers can be looked up across users, and
the server's daily report counters expire on their own.

For the report numbers: run the lookup from "Answering reports" once with any
number. Until the setting exists, Firestore refuses the query with a link to
create it. Open the link, check it names collection `reports` and field
`number`, with Ascending for Collection group, and save. Once it shows as
ready, the lookup works.

For the counters (the command may take a few minutes; Ctrl-C stops only the
waiting, and `gcloud firestore fields ttls list --project $APP` shows it):

```bash
gcloud firestore fields ttls update expireAt --project $APP \
  --collection-group reportCounts --enable-ttl
```

**5. The deploy account and Workload Identity Federation.** GitHub can use it
only from this repository, only from `main`, only in the `production`
environment:

```bash
gcloud iam service-accounts create github-deploy --project $APP --display-name "GitHub Actions deploy"
sleep 60
for role in roles/firebasehosting.admin roles/firebaserules.admin roles/cloudfunctions.developer \
            roles/cloudscheduler.admin roles/eventarc.developer roles/run.admin \
            roles/artifactregistry.admin roles/secretmanager.viewer roles/iam.securityReviewer \
            roles/serviceusage.serviceUsageConsumer roles/serviceusage.serviceUsageViewer \
            roles/firebaseextensions.viewer roles/firebase.viewer; do
  gcloud projects add-iam-policy-binding $APP --member serviceAccount:$DEPLOY_SA \
    --role $role --condition None --quiet > /dev/null
done
gcloud iam service-accounts add-iam-policy-binding $FUNCTIONS_SA --project $APP \
  --member serviceAccount:$DEPLOY_SA --role roles/iam.serviceAccountUser
# firebase deploy checks it can act as the App Engine default account before any
# functions deploy, whichever account the functions run as.
gcloud iam service-accounts add-iam-policy-binding $APP@appspot.gserviceaccount.com --project $APP \
  --member serviceAccount:$DEPLOY_SA --role roles/iam.serviceAccountUser
# Cloud Functions builds each function with Cloud Build, which runs as the
# default compute account, so the deploy must be able to act as it too.
gcloud iam service-accounts add-iam-policy-binding $COMPUTE_SA --project $APP \
  --member serviceAccount:$DEPLOY_SA --role roles/iam.serviceAccountUser

gcloud iam workload-identity-pools create github --project $APP --location global \
  --display-name "GitHub Actions"
gcloud iam workload-identity-pools providers create-oidc awt-inventory --project $APP \
  --location global --workload-identity-pool github \
  --display-name "dochavok/awt-inventory" \
  --issuer-uri https://token.actions.githubusercontent.com \
  --attribute-mapping 'google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref,attribute.environment=assertion.environment' \
  --attribute-condition "assertion.repository == '$REPO' && assertion.ref == 'refs/heads/main' && assertion.environment == 'production'"
gcloud iam service-accounts add-iam-policy-binding $DEPLOY_SA --project $APP \
  --role roles/iam.workloadIdentityUser \
  --member "principalSet://iam.googleapis.com/projects/$APP_NUMBER/locations/global/workloadIdentityPools/github/attribute.repository/$REPO"
echo "GCP_WORKLOAD_IDENTITY_PROVIDER: projects/$APP_NUMBER/locations/global/workloadIdentityPools/github/providers/awt-inventory"
```

**6. Labels** in `awt-inventory-reports` for each report kind: `missing-skill`,
`bug`, `idea` (Issues → Labels → New label), so issues get them.

**7. Secrets:** the three in "Renewing secrets", set with
`firebase functions:secrets:set`, then give the functions' account access:

```bash
for s in GITHUB_APP_PRIVATE_KEY RESEND_API_KEY MAINTAINER_EMAIL; do
  gcloud secrets add-iam-policy-binding $s --project $APP \
    --member serviceAccount:$FUNCTIONS_SA --role roles/secretmanager.secretAccessor > /dev/null
done
```

**8. GitHub:** the `production` environment's variables and secrets (table in
"Deploying"), deployable from `main` only.
