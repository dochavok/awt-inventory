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
- `docs/`: the in-app user guide (DOC-1) and `docs/maintainer.md` (DOC-5).
- `tests/`: rule scenarios, `fixtures/` (made-up users and characters, and the
  test copy of the reference data), access rule tests, browser tests.
- `var/`: local runtime files such as emulator data. Git-ignored.
- Secrets come only from the host's secret store or GitHub secrets, never from
  committed files.

## Running the checks

Set up in M1; this section is filled in then. It will cover the tests (with
milestone markers, TF-5), type checks and lint, the coverage table (TF-4), the
Firestore emulator tests (TF-11) and the test-change check (TF-7).

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
