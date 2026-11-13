# Search and export

reviewed: 2026-11-12

## Search

The search box finds a character's entries in every category, skills included, by name, description and notes. Results update as you type, and each shows its category. You can widen the search to all your characters, retired ones included; each result then names its character.

A search ignores capitals and accents, and matches anywhere in a word: "fang" finds both Twin Fangs and Duskfang. With several words, each must be in the same name, description or notes. Results where every word typed starts a word come first.

A category's list can also be filtered by equipped or active, rarity and item family.

## The printable sheet

Make a PDF for one character, or for all characters that aren't retired. It shows each character's name, class and level, what's equipped, every category with quantities, skills with their usage and tier, titles, and notes. Tick **include skill text** to add the skills' card text. Every page shows when the sheet was made, so an old copy is easy to spot.

Save the PDF to your phone's files to open it later without signal. It prints on Letter or A4 paper.

## The JSON export

Download one JSON file with everything in your account: characters, entries, grants, titles and history. Keep a copy: the app may change or shut down.

The file's `formatVersion` says which version of the format it uses. Field names are stable and readable, so tools such as Excel's Power Query can load it. If a field is ever renamed, `formatVersion` changes too.
