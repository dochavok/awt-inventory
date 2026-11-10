# AWT Inventory

A web app, built for phones, where players of **Adventures from the Wizards
Tower** (AWT) keep their characters' inventory, skills, titles and history. It
works out each character's totals (CM, mitigation, hearts and combat dice) from
what is equipped, enforces the slot rules, and exports a printable sheet for
use at the faire without signal.

**Status:** M2 (core records) in progress: accounts, sign-up and the data layer.
Runs only on the local Firebase emulators so far.

- What the app does: [inventory-requirements.md](inventory-requirements.md)
- Rule questions waiting on the DMs: [dm-rule-questions.md](dm-rule-questions.md)

## Running it locally

Needs Node.js 26 and Java 21 (for the emulators).

1. `npm ci`
2. `npm run emulators` starts Firebase Authentication and Firestore locally,
   under the demo project `demo-awt-inventory`.
3. In a second terminal, `npm run dev`, then open <http://localhost:4173>.

Sign-up is invite-only (NF-13). To invite an email on the local emulator
(PowerShell):

```powershell
Invoke-RestMethod -Method Patch -Headers @{ Authorization = "Bearer owner" } -ContentType "application/json" `
  -Uri "http://127.0.0.1:8080/v1/projects/demo-awt-inventory/databases/(default)/documents/invites/you@example.test" `
  -Body '{"fields":{"addedBy":{"stringValue":"local"}}}'
```

Email verification and reset links appear in the emulator's terminal output.
The checks CI runs are listed in [CLAUDE.md](CLAUDE.md).

## Licence

The code is under the [MIT licence](LICENSE). AWT's game content (names, rules,
skill and spell text, the level chart and other game data) belongs to the
game's owner and is **not** covered by that licence.
