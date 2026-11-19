# AWT Inventory

Web app, built for phones, where AWT players keep their characters' inventory,
skills, titles and history, with totals and slot rules worked out for them. The
source of truth is [inventory-requirements.md](inventory-requirements.md). Open
rule questions for the DMs are in [dm-rule-questions.md](dm-rule-questions.md).

- Stack (requirements section 20): TypeScript, React and Vite, installable to the
  home screen; Firebase Authentication, Cloud Firestore (with its offline cache),
  Cloud Functions and Hosting; Vitest, fast-check, Playwright.
- Milestones: requirements section 16. M1 writes the functional tests only; later
  milestones implement code to pass them.
- **This repository is public.** Never describe a security weakness in an issue,
  PR, commit message, branch name or code comment: record it in the brain's
  project file and tell Craig. Player reports go to the private
  `awt-inventory-reports` repository, never here (SP-2).

## The test-change rule (requirements TF-6): never break this

Tests are written from the requirements, before the code. **A failing test means
the code is wrong.** Never change, delete, skip, weaken or mark as expected-failure
a test to make code pass. That includes anything under `tests/`: the rule
scenarios and their expected values, the fixtures and test reference data in
`tests/fixtures/`, and snapshot files.

If you believe a test itself is wrong, stop and follow exactly this sequence:

1. **Ask Craig.** Explain which test, what it expects, what you think is wrong,
   and which requirement it traces to. Do not continue until Craig confirms the
   test is wrong. Never decide this yourself.
2. **Fix the requirements document** so it states how the app should behave.
3. **Fix the test** so it matches the corrected requirement. Commit steps 2 and 3
   together; the commit message names the requirement changed.
4. **Fix the code** until the test passes.

If Craig says the test is right, fix the code instead.

Adding **new** tests for existing requirements is fine without this sequence.
When a DM answers a question in `dm-rule-questions.md`, start at step 2.

## Where things live

- `data/`: the reference data (level chart, slot kinds, rarities, suggestions,
  skill list) as YAML. Committed. Entries are retired, never deleted (RD-3).
- `docs/`: the in-app user guide (DOC-1), `docs/maintainer.md` (DOC-5, with
  the one-time setup) and `docs/restore-runbook.md` (NF-10).
- `functions/`: the Cloud Functions (reports, backups), in `us-east4`, with
  their own `package.json`. Only wiring lives there: the logic is in
  `src/server/`, tested from `tests/server/`. `npm run build` there
  type-checks and bundles into `functions/lib/` (git-ignored), as CI and the
  deploy do.
- `.github/workflows/deploy.yml`: deploys after CI passes on a push to `main`
  (NF-11). Merging to `main` is shipping to production.
- `tests/`: rule scenarios, `fixtures/` (made-up users and characters, and the
  test copy of the reference data), access rule tests, browser tests.
- `var/`: local runtime files such as emulator data. Git-ignored.
- Secrets come only from the host's secret store or GitHub secrets, never from
  committed files.

## Running the checks

Each is a CI job, and all five are required checks on `main`:

| CI job | Command | What it checks |
|---|---|---|
| `lint` | `npm run lint` | ESLint, Prettier and `tsc`. CI's `lint` job also builds `functions/` (`npm run build` there, the same one the deploy runs); `npm run lint` alone doesn't |
| `test` | `npm test` | Vitest: rule scenarios, property tests, data layer, harness (`tests/meta`), and the coverage table |
| `access-rules` | `npm run test:access` | Firestore rules and offline sync in the emulator (needs Java 21) |
| `browser` | `npm run test:browser` | Playwright on iPhone (WebKit) and Android (Chromium) profiles, against the emulators it starts itself (needs Java 21); one made-up player signs up first to warm everything up (`tests/support/browser-warm-up.ts`, TF-13) |
| `test-change-rule` | `npm run check:test-changes -- --base origin/main` | The test-change rule (TF-7), run in CI as it is on `main` (`test-change-rule.yml`); see `scripts/test-change-lib.ts` |

- **Tags and milestones (TF-4, TF-5):** declare every test with `rule()`
  (`tests/support/rule.ts`) or `browserRule()`. Tests for milestones not in
  `package.json` `awt.finishedMilestones` fail as expected (a stub or an
  assertion), or pass early once earlier code already does what they check;
  any other error fails. A test that reaches a stub (stubs throw
  `NotImplementedError.stub(…)`, which counts them) never passes: unfinished,
  it fails as expected; finished, it fails. The run ends with a table of passed / passed early /
  failed as expected / failed by milestone. Finishing a milestone adds it to
  that list. List the tests that passed early in the PR; before any code exists
  (M1), a test that passes early can't fail, so fix it.
- **Coverage (TF-4):** after adding or retagging tests, run
  `npm run coverage:write` and commit `tests/COVERAGE.md`; `npm test` fails if
  it's stale.
- **Docs examples (DOC-4):** after changing what an example shows (the
  sample in `docs/sample/`, or the code that makes the output), run
  `npm run docs:write` and commit the pages it updates; `npm test` fails if
  they're stale.
- **Scenarios (TF-9):** YAML in `tests/scenarios/`, checked against a strict
  schema (`tests/support/scenarios.ts`); IDs are permanent.
- **On this PC:** Norton quarantined Playwright's WebKit, so run browser tests
  locally with `npx playwright test --project android --workers 2`; CI runs
  both phones. Use 2 workers: Playwright's default here is 6, and on a fresh
  build that overloads this PC and tests time out (2 of 3 runs failed at 6
  workers, none at 2). CI's runners already use 2. The warm-up (TF-13) stopped
  the first test on each worker timing out on a fresh build (2 of 3 full runs
  failed without it, none of 3 with it).

## Other conventions

- Every test names the requirement ID(s) it checks (e.g. `EQ-2`) and any DM
  question it depends on (e.g. `Q1`). Untagged tests fail.
- **Assertions must be able to fail** (TF-8): tie each value to the character and
  total it belongs to, check a block names what was blocked, and check access
  tests refuse the other user, not just allow the owner. Before trusting a new
  test, break the code it guards and watch it fail (TF-12).
- **Requirement IDs are permanent** (TF-4): never renumber or reuse one. A removed
  requirement keeps its place, marked *removed*.
- Keep the rules core pure TypeScript with no Firebase, network or UI code (TF-2).
- Validate YAML reference data with `zod`; never trust it unchecked.
- Store and compare all times in UTC; show them in the user's local time.
- When a requirement changes, update the user guide pages that describe it in
  the same pull request (DOC-3).
- No real player data in tests, fixtures, docs or examples. Use made-up
  characters.
- **Game content in this public repository** (RD-8): the game's owner agreed
  (Q10) that `data/` may hold the skill and spell card text and the level
  chart's numbers; they remain the owner's, and the MIT licence doesn't cover
  them. Tests use their own made-up reference data and never name real skills
  or numbers: browser tests read what they need from `data/` (TF-13).
