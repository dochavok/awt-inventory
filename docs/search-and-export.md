# Search and export

reviewed: 2026-11-27

## Search

On a character's page, tap **Search** to look through that character's entries in every category, skills included, by name, description and notes. Results update as you type. Each shows its category, and where the words were found if not in the name. Tap a result to open it.

Tick **Search all my characters** to look through all of them, retired ones included; each result then names its character. **Search all characters** on your characters list starts there.

A search ignores capitals and accents, and matches anywhere in a word: "fang" finds both Twin Fangs and Duskfang. With several words, each must be in the same name, description or notes. Results where every word typed starts a word come first. Typing only punctuation finds nothing.

Search works without signal too, on everything the app has stored on your phone.

## Filters

A category's list can be filtered by rarity and by item family, and by what's equipped (**Equipped only**; for familiars and allies, **Active only**). The filters offer what that list has.

## The printable sheet

Tap **Print or export** on a character's page or on your account page. Choose one character, or all characters that aren't retired, and Letter or A4 paper, then tap **Create PDF** and **Save**.

The sheet shows each character's name, class and level, its totals with where they come from (damage included), under each total the situational grants and dice that aren't added in (such as +5 CM vs Evil), what's equipped, every category with quantities, skills with their usage and tier, titles, and notes. Each character starts on a new page. Tick **include skill text** to add the skills' card text. Every page shows when the sheet was made, so an old copy is easy to spot.

Save the PDF to your phone's files (on iPhone, the Files app) to open it later without signal. It prints on Letter or A4 paper. The sheet is made on your phone, so it works without signal too.

## The JSON export

On the same screen, tap **Create JSON file** and **Save** to download one file with everything in your account: characters, entries, grants, titles and history. Keep a copy: the app may change or shut down.

The file's `formatVersion` says which version of the format it uses. Field names are stable and readable, so tools such as Excel's Power Query can load it. If a field is ever renamed, `formatVersion` changes too.

### The format

- `formatVersion`, `exportedAt` (when the file was made, in UTC) and `profile` (your display name).
- `characters`: one for each character, retired ones included, each with:
  - `character`: its name, class, level, notes and whether it's retired;
  - `entries`: everything in its inventory, each with its `category` and that category's fields. A skill has its `skillId` from the skill list, how and at what level it was gained;
  - `equipped`: what's equipped, each with its `entryId` and its `slot` (a slot kind such as `back`, `both-hands` for a two-handed weapon, or `arcane`). An entry's and a title's `grants` are with them;
  - `manualGrants`: grants added straight to the character, each with its `reason`;
  - `history`: every record, newest first, with its `event` (`acquired`, `used`, `restored`, `traded`, `level-changed` and the like), when it happened (`date`) and was entered (`enteredAt`), and what it was about.
- `titles`: your titles, each with its `scope`: the whole player, or one character.
- `todo`: empty until the to-do list comes.

Times are in UTC, ISO 8601 (`2026-05-02T18:00:00.000Z`).

### An example

The export of a made-up character, Mirela, with a lantern found on a quest, one of two tonics used, a skill and a title:

<!-- generated: json-example -->
```json
{
  "formatVersion": 1,
  "exportedAt": "2026-05-02T18:00:00.000Z",
  "profile": {
    "displayName": "Lantern Keeper"
  },
  "characters": [
    {
      "character": {
        "id": "c1",
        "name": "Mirela",
        "className": "Mage",
        "level": 9,
        "notes": "Made-up sample character for the guide."
      },
      "entries": [
        {
          "category": "armor",
          "name": "Dusk Cloak",
          "quantity": 1,
          "slotKind": "back",
          "id": "e16",
          "characterId": "c1"
        },
        {
          "category": "consumables",
          "name": "Ember Tonic",
          "quantity": 1,
          "id": "e22",
          "characterId": "c1"
        },
        {
          "id": "e27",
          "characterId": "c1",
          "category": "skills",
          "skillId": "find-familiar",
          "howGained": "starting",
          "levelGained": 1,
          "quantity": 1
        },
        {
          "category": "armor",
          "name": "Grey Cloak",
          "quantity": 1,
          "slotKind": "back",
          "id": "e19",
          "characterId": "c1"
        },
        {
          "category": "items",
          "name": "Moonlit Lantern",
          "quantity": 1,
          "description": "Made-up item for the guide.",
          "itemFamily": "Starglass",
          "rarity": "epic",
          "arcane": true,
          "id": "e4",
          "characterId": "c1",
          "grants": [
            {
              "kind": "cm",
              "amount": 2,
              "id": "g2"
            },
            {
              "kind": "die",
              "die": "1d6",
              "id": "g3"
            }
          ]
        },
        {
          "category": "armor",
          "name": "Starglass Circlet",
          "quantity": 1,
          "slotKind": "head",
          "id": "e9",
          "characterId": "c1",
          "grants": [
            {
              "kind": "mitigation",
              "amount": 1,
              "id": "g7"
            },
            {
              "kind": "cm",
              "amount": 1,
              "condition": "vs Undead",
              "id": "g8"
            }
          ]
        }
      ],
      "equipped": [
        {
          "entryId": "e4",
          "slot": "arcane"
        },
        {
          "entryId": "e9",
          "slot": "head"
        },
        {
          "entryId": "e16",
          "slot": "back"
        },
        {
          "entryId": "e19",
          "slot": "back"
        }
      ],
      "manualGrants": [
        {
          "id": "g35",
          "reason": "DM ruling, made-up faire",
          "grants": [
            {
              "kind": "hearts",
              "amount": 1,
              "id": "g33"
            },
            {
              "kind": "extra-damage",
              "amount": 2,
              "condition": "vs Undead",
              "id": "g34"
            }
          ]
        }
      ],
      "history": [
        {
          "id": "h36",
          "characterId": "c1",
          "enteredAt": "2026-05-02T18:00:00.000Z",
          "event": "traded",
          "date": "2026-05-02T18:00:00.000Z",
          "entryId": "e13",
          "entryName": "Wayfarer's Sash",
          "category": "armor",
          "quantity": 1,
          "note": "A made-up trader",
          "snapshot": {
            "name": "Wayfarer's Sash",
            "category": "armor",
            "quantity": 1
          },
          "summary": "Traded 1 × Wayfarer's Sash"
        },
        {
          "id": "h28",
          "characterId": "c1",
          "enteredAt": "2026-05-02T18:00:00.000Z",
          "event": "acquired",
          "date": "2026-05-02T18:00:00.000Z",
          "entryId": "e27",
          "entryName": "Find Familiar",
          "category": "skills",
          "quantity": 1,
          "summary": "Acquired 1 × Find Familiar"
        },
        {
          "id": "h25",
          "characterId": "c1",
          "enteredAt": "2026-05-02T18:00:00.000Z",
          "event": "used",
          "date": "2026-05-02T18:00:00.000Z",
          "entryId": "e22",
          "entryName": "Ember Tonic",
          "category": "consumables",
          "quantity": 1,
          "note": "At the made-up river crossing",
          "summary": "Used 1 × Ember Tonic"
        },
        {
          "id": "h23",
          "characterId": "c1",
          "enteredAt": "2026-05-02T18:00:00.000Z",
          "event": "acquired",
          "date": "2026-05-02T18:00:00.000Z",
          "entryId": "e22",
          "entryName": "Ember Tonic",
          "category": "consumables",
          "quantity": 2,
          "summary": "Acquired 2 × Ember Tonic"
        },
        {
          "id": "h20",
          "characterId": "c1",
          "enteredAt": "2026-05-02T18:00:00.000Z",
          "event": "acquired",
          "date": "2026-05-02T18:00:00.000Z",
          "entryId": "e19",
          "entryName": "Grey Cloak",
          "category": "armor",
          "quantity": 1,
          "summary": "Acquired 1 × Grey Cloak"
        },
        {
          "id": "h17",
          "characterId": "c1",
          "enteredAt": "2026-05-02T18:00:00.000Z",
          "event": "acquired",
          "date": "2026-05-02T18:00:00.000Z",
          "entryId": "e16",
          "entryName": "Dusk Cloak",
          "category": "armor",
          "quantity": 1,
          "summary": "Acquired 1 × Dusk Cloak"
        },
        {
          "id": "h14",
          "characterId": "c1",
          "enteredAt": "2026-05-02T18:00:00.000Z",
          "event": "acquired",
          "date": "2026-05-02T18:00:00.000Z",
          "entryId": "e13",
          "entryName": "Wayfarer's Sash",
          "category": "armor",
          "quantity": 1,
          "summary": "Acquired 1 × Wayfarer's Sash"
        },
        {
          "id": "h10",
          "characterId": "c1",
          "enteredAt": "2026-05-02T18:00:00.000Z",
          "event": "acquired",
          "date": "2026-05-02T18:00:00.000Z",
          "entryId": "e9",
          "entryName": "Starglass Circlet",
          "category": "armor",
          "quantity": 1,
          "summary": "Acquired 1 × Starglass Circlet"
        },
        {
          "id": "h5",
          "characterId": "c1",
          "enteredAt": "2026-05-02T18:00:00.000Z",
          "event": "acquired",
          "date": "2026-05-02T18:00:00.000Z",
          "note": "From the made-up Night Market quest",
          "source": "Quest",
          "link": "https://example.com/rewards/42",
          "entryId": "e4",
          "entryName": "Moonlit Lantern",
          "category": "items",
          "quantity": 1,
          "summary": "Acquired 1 × Moonlit Lantern"
        }
      ]
    }
  ],
  "titles": [
    {
      "id": "t30",
      "name": "Keeper of the Lanterns",
      "scope": {
        "level": "player"
      },
      "grants": [
        {
          "kind": "cm",
          "amount": 1,
          "id": "g31"
        },
        {
          "kind": "extra-damage",
          "amount": 1,
          "damageType": "fire",
          "id": "g32"
        }
      ],
      "description": "Made-up title for the guide.",
      "earned": "2026-04-18"
    }
  ],
  "todo": []
}
```
<!-- end generated: json-example -->
