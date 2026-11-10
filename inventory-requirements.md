# AWT Inventory: Requirements

**Version:** 0.4 (sections 1–20 approved by Craig) · **Date:** 2026-11-09 · **Owner:** Craig
**Related:** [dm-rule-questions.md](dm-rule-questions.md) (rule questions waiting on the DMs)

---

## 1. Purpose and Scope

AWT players keep their characters' records on paper or in their own spreadsheets: weapons, armor, skills, allies, consumables, items and components, plus titles and a running total of their CM. Those records drift out of date, the totals are added up by hand, and the slot rules (one item per paper-doll slot, a limited number of arcane slots, one legendary item at a time) are easy to break without noticing.

This app is a web app, built to be used on a phone at the faire. Each player signs in and keeps their own characters in it. For each character it records everything they own and what they have equipped. It works out the character's totals (CM, mitigation, hearts and combat dice) from what is equipped, with a breakdown that matches how players already write them down. Skills and spells are picked from the game's own list. The app keeps a history of what was gained, used and traded, and exports a printable sheet to use when there's no signal.

### Goals

- A player can see everything a character has, and what is in use, on a phone at the faire.
- Totals are worked out from what is equipped, never typed in, and each total shows where it comes from.
- Slot rules are enforced, so a character sheet can't reach an impossible state. Where the game has legitimate exceptions (skills from another tree, permissions granted by a DM), the app warns instead of blocking.
- Anything gained, used or traded is recorded with its date.
- It's built for many players from the start, and each player sees only their own data.

### Non-goals

- **No DM role, and not an official record.** The app is the player's own record. DMs rule on the game.
- **No item catalog.** Players type in their own items. Skills and spells are the exception: they come from the game's list.
- **No zenni.**
- **No combat tracking.** The app doesn't roll dice or track uses per combat or per day.
- **No party bonuses.** Those are the bonus bot's job. A link to it may come later.
- **No native phone app.** The app is a web app (no App Store or Play Store).
- **Temporary effects stay out of totals.** They're listed as *situational*.

## 2. Glossary

AWT terms shared with the other AWT projects (Faire day, Class, Hearts, CM, CR, DM, Zenni…) are defined in the brain's AWT glossary. This section defines the terms as **this app** uses them.

| Term | Meaning |
|---|---|
| **User** | Someone with an account. A player of AWT. |
| **Maintainer** | Whoever edits the app's reference data and runs the app (Craig at launch). Has no special screens in the app. |
| **Character** | One of a user's AWT characters, with a name, a class (Warrior, Mage or Rogue) and a level (1 up to the highest level in the level chart: 75 today). A user can have any number. |
| **Retired character** | A character the user has stopped playing. Hidden from the main list but kept whole, and can be brought back. |
| **Category** | One of the seven inventory sections: **Weapons, Armor, Skills, Familiars/Allies, Consumables, Items, Components**. |
| **Entry** | One thing a character has in a category, such as a sword, a potion or a skill. |
| **Equipped / in use** | A weapon or piece of armor in a slot, or an arcane item in an arcane slot. An *active* ally counts the same way. Only equipped entries (and skills and titles) give grants. |
| **Paper doll** | The character's equipment slots: the standard slots (Head, Chest… Relic) plus Main hand and Off hand. Each piece of armor fits one kind of slot. |
| **Arcane item / arcane slot** | An arcane item (normally from Items) is in use only while it's in an arcane slot. Arcane items never take a paper-doll slot. A character's number of arcane slots comes from class and level, plus grants. |
| **Rarity** | An optional label on an item: Epic, Legendary, Divine or Mythic. Some rarities limit how many items can be equipped at once (Legendary: one, unless allowances are granted). Arcane items usually have none. |
| **Allowance** | The number of items of a rarity that a character may have equipped at once. |
| **Permission** | Whether a character may equip a kind of thing: Weapon Use, Ranged Weapon Use, Armor Use, Dual Wielding. It comes from the character's skills, or from a manual grant. |
| **Grant** | Something a source adds to a character: CM, mitigation, hearts, an extra die, extra slots of some kind, a rarity allowance, a permission, or a resistance, immunity or CR bonus. |
| **Source** | What a grant comes from: an entry (counted only while equipped or active), a skill, a title, or a manual grant with a reason. |
| **Situational** | A grant with a condition ("vs Evil", "with ranged weapons"). Listed with its source, but never added to a total. |
| **Class bonus** | Combat Bonus (Warrior), Arcane Bonus (Mage) or Stealth Bonus (Rogue), from the level chart. Part of CM, and also shown on its own because it's used elsewhere too. |
| **CM** | Combat modifier: one number, the class bonus plus every unconditional CM grant. Shown with a breakdown by source category. |
| **Mitigation** | Hearts of damage taken off each hit in combat. Grants from all sources add up. |
| **Combat dice** | The dice a character rolls in combat: the level chart's dice, plus any extra dice from grants, each listed with its source. |
| **Title** | An honour from the game, with a name and a description. **Player-level** by default (applies to all of the user's characters). Can be made **character-level** (applies to one character). A Patreon tier is recorded as a title. |
| **Skill list** | The game's skills and spells, kept as reference data in the repository. It was built from the maintainer's skill and spell artifacts and is now the app's own source (RD-6). Skills are picked from it, never typed in. |
| **Item family** | An optional group that an item belongs to by origin or theme, across categories, e.g. Passion (made by Will Passion) or Glizzy. Typed by the player, so not a fixed list. Called *item class* in the bonus bot. |
| **Weapon group** | The kind of weapon, e.g. Sword, Dagger, Bow. The term Weapon Focus uses. |
| **Component tier** | A crafting component's tier, usually Minor, Major, Epic or Legendary, but typed by the player, since tiers are sometimes made up. Unrelated to item rarity. |
| **Used** | A consumable or component spent in play. Its quantity drops by one and the history records it. It can be restored. |
| **Traded** | An entry traded or given away. It leaves the inventory and the history records it. |
| **Hard delete** | Removing an entry entered by mistake. It leaves no trace in the history. |
| **History** | A character's dated record of entries gained, used, traded and restored, and of level and class changes. Records can't be edited (HI-4). |
| **Over-limit alert** | A notice on a character that has more equipped than it's now allowed, because a grant was lost (for example, the item giving a second Back slot was traded). |
| **Reference data** | The data files that hold the game's fixed lists (the level chart, slot kinds, rarities and the skill list) and the common suggestions for free-text fields (item families, component tiers). |
| **Quickslot**, **DM Arcane** | Game features still to be understood (DM questions Q4 and Q6). |

## 3. Users and Access

Every user is a player and has the same abilities. There's no DM or admin role in the app. The maintainer works only through the reference data files and the hosting provider's console.

### 3.1 Accounts

**AC-1 · Must · M2: Signing in.** A user can create an account and sign in with a Google account or with an email address and password. Email accounts are verified, and a forgotten password can be reset by email.

**AC-2 · Must · M2: Display name.** A user chooses a display name at sign-up and can change it at any time. No real name is asked for. It's the only account detail ever shown to other users (trading, section 18).

**AC-3 · Must · M2: Stays signed in.** On a phone, a user stays signed in until they sign out, so they never have to sign in at the faire.

**AC-4 · Must · M2: Terms of use.** To create an account, a user accepts terms of use, written in plain language, which say:

- accounts are for ages 13 and up;
- the app is the player's own record, not an official one: DMs and the game's rules decide what a character has;
- trades are arranged and carried out between players, outside the app, which only shows listings;
- no offensive display names or listing text, and no listings for things the user doesn't have; the maintainer may remove content or accounts that break this;
- the app is provided as is, may change or shut down, and data could be lost, so users are encouraged to keep their own export (section 10);
- deleting an account is permanent (AC-5).

**AC-5 · Must · M2: Deleting an account.** A user can delete their own account. After confirmation (typing their display name), every character, entry, title, history record and to-do task in it is removed permanently. Nothing is kept or retired.

### 3.2 Privacy

**PV-1 · Must · M2: Owner only.** A user's characters, entries, titles, history and to-do list can be read and changed only by that user, **except** that an entry the user marks *available for trade* (section 18) can be **read** by any signed-in user. Only the owner can ever change their data. This is enforced by the server, not just by the screens, so it holds even against a request made outside the app.

**PV-2 · Must · M2: Little personal data.** The app stores only the sign-in identity (email address or Google account), the display name, and the user's game records.

**PV-3 · Must · M2: No admin screens.** No one can browse other users' data in the app. The maintainer can reach stored data only through the hosting provider's console, and uses that only for support a user has asked for.

**PV-4 · Must · M2: Privacy note.** The app has a short page saying what it stores, who can see it (PV-1, PV-3), and how to delete it (AC-5). It's linked from sign-up and from the account page.

Trading (section 18) is the only feature that shows anything to other users. A listed entry shows its name, category, description, rarity, item family, the quantity offered and the owner's display name. It never shows the character's name, notes or history, or anything else about the user.

## 4. Characters and Titles

### 4.1 Characters

**CH-1 · Must · M2: Creating a character.** A user can create a character with a name, a class (Warrior, Mage or Rogue) and a level, plus optional notes. A user's characters must have different names (ignoring case). Different users may use the same name.

**CH-2 · Must · M2: Editing.** The user can change a character's name, level and notes at any time.

**CH-2a · Must · M2: Correcting the class.** The game has no way to change class, so changing a character's class is only for fixing a mistake made when the character was created. The app shows a clear warning that this isn't a normal change, and says what it affects (class bonus, combat dice, hearts, arcane slots, and which skills are in the character's own trees). The user must confirm. The change is recorded in the character's history, e.g. "Class corrected: Rogue → Warrior".

**CH-3 · Must · M2: Level.** A level is from 1 up to the highest level in the level chart (RD). Every change of level is recorded in the character's history, e.g. "Level 12 → 13" (HI).

**CH-4 · Must · M2: No limit.** There is no limit on how many characters a user can have.

**CH-5 · Must · M2: Retiring.** A user can retire a character and bring it back later. A retired character is hidden from the main list (shown under *Retired*), but nothing in it is changed or removed. Player-level titles still list it.

**CH-6 · Must · M2: Deleting.** A user can delete a character permanently, with everything in it and its history, after confirmation (typing the character's name). Character-level titles on it are deleted too. Player-level titles are not.

### 4.2 Titles

**TI-1 · Must · M2: Adding a title.** A user can add a title with a name, a description and an optional date earned. The description is optional, but the form asks for it and the title list shows it.

**TI-2 · Must · M2: Player-level by default.** A new title is player-level: it applies to all of the user's characters, including ones created later. The user can switch it to character-level for one chosen character, and back again.

**TI-3 · Must · M2: Patreon tiers.** Patreon tiers are recorded as titles. The app has no link to Patreon and doesn't know the tiers.

**TI-4 · Must · M2: Editing and removing.** A user can edit or remove a title. Removing it removes its grants (section 8), which may raise an over-limit alert (section 9).

**TI-5 · Must · M4: Grants.** A title can carry grants (section 8), for example "+1 Back slot" or "+1 Legendary allowance". A player-level title's grants apply to every character, and a character-level title's only to its character.

Titles are free text, like items. There's no list of titles in the reference data.

## 5. Inventory

A character's inventory has seven categories. This section covers every category except Skills (section 6). Equipping is in section 9, and what entries grant is in section 8.

### 5.1 Entries

**IN-1 · Must · M2: Common fields.** Every entry has a **name** (required), a **quantity** (a whole number, default 1), a **description** (the card's text) and **notes**.

**IN-2 · Must · M2: Rarity and item family.** Weapons, Armor and Items can have an optional **rarity**, from the reference data. Any entry outside Skills can have an optional **item family** (free text, with suggestions: the user's earlier families and the common ones in the reference data). Players may have families the maintainer doesn't know about, so there's no fixed list.

**IN-3 · Must · M2: Weapons.** Weapons also have: one-handed or two-handed; melee or ranged; a **weapon group** (free text, with the user's earlier weapon groups offered as suggestions); and **extra damage** in hearts (shown on the weapon, never added to a total).

**IN-4 · Must · M2: Armor.** Armor also has the **paper-doll slot** it fits, from the reference data (a shield fits Off hand).

**IN-5 · Must · M2: Items.** Items are either **arcane** or not. Items never fit a paper-doll slot.

**IN-6 · Must · M2: Familiars/Allies.** Familiars and allies also have a **type** (free text, e.g. ally or familiar, with earlier types offered as suggestions), **their own hearts**, and whether they're **active**.

**IN-7 · Must · M2: Components.** Components also have a **tier** (free text, with suggestions: the user's earlier tiers and the common ones in the reference data). Players and DMs sometimes make up tiers, so there's no fixed list.

**IN-8 · Must · M2: Editing.** The user can change any field of an entry at any time. Edits aren't recorded in the history, except quantity changes (IN-10).

**IN-9 · Must · M2: Lists.** Each category lists the character's entries alphabetically. Entries that are equipped or active are marked as such.

### 5.2 Gaining, using and losing entries

**IN-10 · Must · M2: Gaining.** Adding an entry, or raising its quantity (such as buying another from a vendor), is recorded in the history as *acquired*, with the quantity.

**IN-11 · Should · M3: Acquisition source.** When gaining an entry, the user can optionally give a source (free text, with suggestions such as vendor, quest, DM award and trade, from the reference data) and a link, such as to the post in Discord's rewards channel. Both are kept with the history record.

**IN-12 · Must · M2: Used.** A consumable or component can be marked *used*. Its quantity drops by one, and the history records it with an optional note. At zero, the entry leaves the list but stays in the history (IN-16).

**IN-13 · Must · M2: Restoring.** A *used* history record can be restored, for example if it was marked used by mistake. The quantity goes back up by one (bringing the entry back if it was at zero), and the history records the restore next to the original.

**IN-14 · Must · M2: Traded or given away.** An entry in any category except Skills can be marked *traded* or *given away*, for all or part of its quantity, with an optional note of who to. If it was equipped or active, it's unequipped first. The history records it with a snapshot of the entry (IN-16). The recipient isn't affected: a transfer between accounts is part of trading (section 18).

**IN-15 · Must · M2: Hard delete.** Any entry can be deleted, for example one added by mistake. The app asks for confirmation, then offers *Undo* for about 10 seconds. A deleted entry leaves no trace: its history records go with it.

**IN-16 · Must · M2: Snapshots.** When an entry leaves the inventory (traded, given away, or used down to zero), its history record keeps a copy of the entry's details at that moment: name, category, description, notes, rarity, item family and the quantity. The record stays readable after the entry is gone.

Lost and broken entries are for later (section 18).

## 6. Skills and the Skill List

Skills and spells aren't typed in. They're picked from the skill list in the reference data, which was built from the maintainer's Warrior, Rogue and Mage artifacts (RD-6). In this section, "skill" covers spells too.

**SK-1 · Must · M2: Adding a skill.** The user picks a skill from the skill list, searching by name. By default the list shows the trees open to the character's class; the user can switch to all trees. The user also records **How gained** (Starting, Level-up, Quest, Trained under the old system, or Other), **Level gained**, and optional notes.

**SK-1a · Must · M2: Available skills first.** The picker first offers the skills the character can take **now**: those whose prerequisites are all on the character, in a tree the character's class and level allow, and not already taken as often as allowed. Starting skills of the character's own trees count as available. Every other skill is listed below them, under a separate heading, and choosing one gives the warnings in SK-3.

**SK-2 · Must · M2: What's shown.** A character's skill shows its name, tree, usage (passive, 1/combat, 1/day, task…), tier (normal, Epic, Legendary) and card text, all from the skill list, plus the user's own fields. Card text is shown only if the game's owner agrees (Q10). Otherwise, the name, tree and tags are shown without the text.

**SK-3 · Must · M2: Warnings, not blocks.** When the user adds a skill, the app warns, but still allows it, if:

- a prerequisite isn't on the character ("needs Weaken");
- the skill is from another class's tree;
- the character's level is below the tree's entry level (such as 51 for prestige trees);
- the character already has it, and the skill can't be taken more than once. Skills that can be taken several times (such as Toughness, up to 5) are counted, and the warning appears only above their limit.

**SK-4 · Must · M2: Removing.** A skill can be hard-deleted, like any entry (IN-15). Skills can't be marked used or traded.

**SK-5 · Must · M2: Not listed.** The skill picker's *Not listed? Tell the maintainer* link opens the report form (SP-1) with *missing or wrong skill* already chosen. In M2, before SP-1 exists, it says "coming soon". Skills that aren't in the list can't be added.

**SK-6 · Should · M4: Record check.** For each level up to the character's level, the level chart says whether that class gains a skill or spell. The app lists levels where the chart gives one but no skill has that *Level gained*, e.g. "Level 17: no skill recorded". This is information only, never a block.

**SK-7 · Should · M4: Grants from the list.** A skill in the list can carry its unconditional grants (such as Mage Armor: +2 CM; Toughness: +1 heart; Arcane Wisdom: +1 arcane slot) and its permissions (Weapon Use, Armor Use, Dual Wielding…). Adding the skill applies them (section 8). Conditional effects appear as situational.

**SK-8 · Must · M2: Permanent IDs.** Each skill in the list has a permanent ID, and characters refer to skills by ID, never by name.

**SK-9 · Should · M5: When the skill list changes.**

- **Changed text or effects** take effect for every character straight away.
- **A removed skill** is retired, not deleted, and stays readable on characters that have it.
- **Merged or renamed skills** are recorded with a *replaced by* link. Affected characters get a notice to review them ("Hex and Curse were merged into Malediction"), and the player chooses to accept the replacement.

## 7. History

**HI-1 · Must · M2: One history per character**, newest first. Each record has a date, an event, the entry it's about (or its snapshot, IN-16), a quantity where one applies, and an optional note.

**HI-2 · Must · M2: Events recorded.** The events are:

- acquired (IN-10, with its source, IN-11);
- used (IN-12);
- restored (IN-13);
- traded and given away (IN-14);
- level changed (CH-3);
- class corrected (CH-2a).

Trading adds *received* (section 18).

**HI-3 · Must · M2: The event date.** It defaults to today, but the user can set an earlier date when recording (such as catching up after a faire weekend: "used at the faire on Saturday"). The record also keeps when it was actually entered. Dates are stored in UTC and shown in the user's local time.

**HI-4 · Must · M2: Records can't be edited** or removed one at a time. The only ways records disappear are a hard delete of their entry (IN-15) or deleting the character (CH-6).

**HI-5 · Should · M3: Filtering.** The history can be filtered by event and by category.

The history is included in the JSON export, but not in the printable sheet (section 10).

## 8. Grants and Totals

A character's totals are never typed in. They're worked out from the level chart and from **grants**: what the character's entries, skills and titles add.

### 8.1 Grants

**GR-1 · Must · M4: Kinds of grant.** A grant is one of:

- CM +n
- mitigation +n hearts
- max hearts +n
- an extra die (in dice notation, e.g. 1d6)
- +n slots of a paper-doll slot kind (e.g. +1 Back)
- +n arcane slots
- +n allowance for a rarity (e.g. +1 Legendary)
- a permission (Weapon Use, Ranged Weapon Use, Armor Use, Dual Wielding)

**GR-2 · Must · M4: Sources.** The user can add grants to any entry in Weapons, Armor, Items or Familiars/Allies, and to any title. Skills get their grants from the skill list (SK-7). A **manual grant**, with a reason (e.g. "DM ruling, Faire 2026"), can be added directly to a character. One source can have several grants.

**GR-3 · Must · M4: When grants count.**

- An entry's grants count only while it's equipped (weapons and armor in a slot, arcane items in an arcane slot) or active (allies).
- Grants from skills, and manual grants, always count.
- A title's grants count for every character if it's player-level, or for its one character if it's character-level (TI-5).
- Consumables and components never give grants.

**GR-4 · Must · M4: Situational grants.** Any grant can have a condition in free text ("vs Evil", "ranged weapons only", "1/combat"). It's then **situational**: listed with its source and condition, but never added to a total.

**GR-5 · Must · M4: Always worked out.** Totals, slot counts and allowances are recalculated from the grants on every change. Nothing that comes from a grant is stored as a number to keep up to date by hand. So trading, unequipping or deleting a source removes its grants immediately.

**GR-6 · Should · M5: Effects as grants.** A source can also grant a **resistance**, an **immunity** or a **CR bonus**, in text (e.g. "Resistance: fire"). The character's Notes page lists the ones that currently apply, with their sources, above the character's free-text notes.

### 8.2 Totals

**GR-7 · Must · M4: Class bonus.** The character's class bonus comes from the level chart for its class and level, under the class's own name: Combat Bonus (Warrior), Arcane Bonus (Mage), Stealth Bonus (Rogue). It's shown on its own line.

**GR-8 · Must · M4: CM.** Total CM is the class bonus plus every CM grant that counts and isn't situational. It's shown with one line per source, in this order: class bonus, Armor, Weapons, Skills, Ally, Items, Titles, Other (manual). Lines that are zero are hidden.
*Example:* Combat Bonus 63, Armor 71, Weapons 15, Skills 11, Ally 10 → **Total CM 170**.

**GR-9 · Must · M4: Mitigation.** Total mitigation is the sum of every mitigation grant that counts and isn't situational, with no maximum, shown with the same breakdown by source.

**GR-10 · Should · M4: Hearts.** Max hearts are the level chart's hearts for the class and level, plus heart grants, shown with the same breakdown.

**GR-11 · Must · M4: Combat dice.** The level chart's combat dice for the level, then each extra die listed with its source, e.g. *3d20 + 1d8 · + 1d6 (Shadow, familiar)*. Dice aren't merged into one expression.

**GR-12 · Must · M4: Where it comes from.** For each total, the user can open a list of every grant in it: the source, its category and the amount. Situational grants are listed separately under each total they would affect.

## 9. Equipping

### 9.1 Paper doll and hands

**EQ-1 · Must · M4: Slots.** Each character has one of each paper-doll slot kind in the reference data (today: Head, Chest, Shoulder, Neck, Back, Glove/Arm, Right Hand (Ring), Left Hand (Ring), Pants, Belt, Boot, Relic) plus **Main hand** and **Off hand**. Slot grants add more of a kind (GR-1).

**EQ-2 · Must · M4: Armor.** A piece of armor can be equipped only in a slot of the kind it fits (IN-4). If every slot of that kind is full, equipping is **blocked**, and the app says which slot kind is full and what's in it.

**EQ-3 · Must · M4: Weapons and shields in hands.**

- A one-handed weapon goes in the Main hand or the Off hand.
- A two-handed weapon takes both hands, and is blocked unless both are free.
- A shield goes only in the Off hand. Until Q2 is answered, a character can't hold two shields.
- A bow and a melee weapon can be held together until Q3 says otherwise.

**EQ-4 · Must · M4: Unequipping.** An equipped entry can be unequipped at any time. It stays in the inventory. Equipping and unequipping aren't recorded in the history. An entry is equipped in at most one place at a time, whatever its quantity. To equip two of the same thing (such as a dagger in each hand), the player records them as separate entries.

**EQ-5 · Must · M4: Paper doll view.** The character's equipment page shows every slot with what's in it, or *Empty*. A slot that comes from a grant is marked with its source (e.g. "Back 2: from *Title: Wanderer*").

### 9.2 Arcane slots

**EQ-6 · Must · M4: Number of arcane slots.** It's the starting number for the character's class, plus the slots the level chart gives that class at each level up to the character's level, plus arcane slot grants.
*Example (from the reference data):* a level 13 Mage has 2 (start) + 2 (levels 5 and 10) = 4, before grants.

**EQ-7 · Must · M4: Arcane items.** An arcane item can be equipped only in an arcane slot, and is blocked when all arcane slots are full. The screen shows the count, e.g. "Arcane slots: 3 of 4 used".

### 9.3 Over-limit alerts

**EQ-8 · Must · M4: Over-limit alert.** If a character ends up with more equipped than allowed, the app **doesn't unequip anything itself**. This can happen through:

- a grant lost (its source traded, unequipped or deleted);
- a title switched to another character;
- the level lowered or the class corrected.

Instead, the character shows an alert naming the slot kind (or arcane slots, or rarity), how many are equipped and how many are allowed, and the grant that was lost where known.
*Example:* "Back: 2 equipped, 1 allowed. The extra slot came from *Cloak of the Wanderer*, which you traded."
Nothing more can be equipped in that slot kind until the user unequips enough to clear the alert.

### 9.4 Permissions and rarity

**EQ-9 · Should · M5: Permissions.** A character's permissions come from its skills (SK-7) and from permission grants (GR-1). Equipping is **allowed with a warning** when:

- the entry is a weapon and the character lacks *Weapon Use*;
- it's a ranged weapon without *Ranged Weapon Use*;
- it's armor or a shield without *Armor Use*;
- it's a one-handed weapon in each hand without *Dual Wielding*.

A two-handed weapon gives no Dual Wielding warning until Q1 is answered.

**EQ-10 · Should · M5: Rarity allowances.** Each rarity in the reference data can have a limit on how many items of it a character may have equipped at once (today: Legendary 1, the others unlimited until Q7 is answered). Allowance grants raise the limit. Equipping beyond it is **blocked**, and losing an allowance raises an over-limit alert (EQ-8). Arcane items count if they have a rarity.

**EQ-11 · Should · M5: Rarity level requirement.** When the reference data gives a minimum level for a rarity (Q5), equipping an item of that rarity on a lower-level character is **blocked**. Until Q5 is answered, there's no check.

## 10. Search and Export

### 10.1 Search

**SE-1 · Must · M3: Search a character.** A search box finds a character's entries in every category, skills included, by name, description and notes. Results update as the user types, and each one shows its category.

**SE-2 · Must · M3: Search all characters.** The user can widen the search to all of their characters, retired ones included. Each result then also shows its character.

**SE-3 · Should · M3: Filters.** A category list can be filtered by equipped or active, rarity and item family.

### 10.2 Export

**EX-1 · Must · M3: Printable character sheet.** The user can create a PDF for one character, or for all characters that aren't retired. For each character it shows:

- name, class and level;
- the totals with their breakdowns (once M4 exists);
- what's equipped (the paper doll and arcane slots);
- every category with quantities, and skills with their usage and tier;
- titles with their descriptions;
- the character's notes.

The card text of skills is included only if the user ticks *include skill text*, to keep the sheet short. The sheet is readable on a phone screen and prints on Letter or A4 paper.

**EX-2 · Must · M3: Saved to the phone.** The PDF can be saved to the phone's files (e.g. the iPhone Files app), so it opens later with no signal.

**EX-3 · Must · M3: Dated.** Every page of the sheet shows when it was created, so an old copy is easy to spot.

**EX-4 · Must · M3: JSON data export.** The user can download one JSON file with everything in their account: characters, entries, grants, titles, history and the to-do list. The file says which format version it uses. Field names are stable and readable, so tools such as Excel's Power Query can load it.

**EX-5 · Should · M3: Format documented.** The user documentation describes the JSON format, with an example generated by the app.

The to-do list joins the printable sheet in M7 (section 11). Sheets are created on the phone itself (section 20), so with NF-3 they can be created without signal too.

### 10.3 Reports to the maintainer

**SP-1 · Must · M3: Reports to the maintainer.** A signed-in user can send the maintainer a report from the app, choosing its kind (missing or wrong skill, bug, idea, account problem) and writing a subject and message, optionally naming a character. Reports are saved in the app's database, where only the sender and the maintainer can read them, and are deleted with the account (AC-5). A user can send at most 5 reports a day.

**SP-2 · Must · M3: Issues from reports.** Every report except *account problem* becomes an issue in a **separate, private** GitHub repository (not the app's public one), labelled with its kind. The issue holds the subject, message, kind, app version and report number, and never the user's email address or display name. The server creates it with a GitHub App installed only on that repository, with permission only for issues. If GitHub can't be reached, the issue is created later, and the report is never lost.

**SP-3 · Must · M3: Account problems stay private.** An *account problem* report isn't sent to GitHub. The maintainer gets an email instead, containing only the report number.

## 11. Faire-Day To-Do List

**Review this section with Craig before building M7.** It was agreed early and hasn't been tried in use, and it may be dropped. Its tests are written after the review (TF-1).

**TD-1 · Must · M7: One list per user.** The to-do list belongs to the user, not to a character. Each task has:

- text;
- a **place**: *Guild hall* or a vendor;
- an optional **character**;
- an optional note;
- a **done** tick box.

**TD-2 · Must · M7: Vendors.** Vendors are the user's own list. Typing a new vendor name when adding a task adds it to the list, and the user picks from it next time. There's no shared list of vendors.

**TD-3 · Must · M7: No dates.** Tasks stay until they're ticked. Done tasks move to the bottom, greyed out, and *Clear done* removes them.

**TD-4 · Must · M7: Grouped by place.** The main view groups tasks by place, so everything at one stop can be dealt with in one go. The user can switch to a single list.

**TD-5 · Must · M7: On the printable sheet.** The printable sheet (EX-1) can include the to-do list, grouped by place, with empty tick boxes for paper.

**TD-6 · Could · M7: Linked to an entry.** A task can point to an entry, e.g. "buy 2 more healing potions". Ticking it offers to raise that entry's quantity, recorded as *acquired* (IN-10).

## 12. Waiting on the DMs

These features are placeholders until the DMs answer. Each will be written out in full, and approved, before M6 starts.

**QS-1 · Could · M6: Quickslots.** Consumables can be placed in quickslots, following the rules from Q4: how many a character has, which containers give them, what each container accepts, and whether a container takes a paper-doll slot. Until then, consumables are only owned and used (IN-12).

**DA-1 · Could · M6: DM Arcane items.** Items can be marked *DM Arcane*, following the rules from Q6. Until then, a DM Arcane item is recorded as an ordinary arcane item, with a note.

**AL-1 · Could · M6: Ally rules.** Any limit on active allies, and how ally equipment works, follows the answers to Q11. Until then, any number of allies can be active, and allies don't have equipment.

## 13. Reference Data

The game's fixed lists are data files in the repository, not part of the code or of these requirements. Changing them is a maintainer task that goes through a pull request like any code change.

**RD-1 · Must · M2: The files.**

- **Level chart:**
  - for each class and level: the class bonus, combat dice, max hearts, whether a skill or spell is gained, and whether an arcane slot is gained;
  - for each class: its starting number of arcane slots;
  - *source:* the AWT level chart (PDF).
- **Paper-doll slot kinds,** including Main hand and Off hand.
- **Rarities:** each with an optional equipped limit and an optional minimum level (EQ-10, EQ-11).
- **Item families (suggestions only):** common families with other names players use (e.g. *Will Passion* for Passion, *hotdog* for Glizzy) and a short description. They're offered as suggestions; players can type any family.
- **Component tiers and acquisition sources (suggestions only):** common values offered as suggestions (IN-7, IN-11). Players can type their own.
- **Skill list:** each skill with its name, tree and kind of tree, the classes the tree is open to, the tree's entry requirement, usage, tier, card text, prerequisites ("A and B", "A or B"), how many times it can be taken, and *retired* or *replaced by* where they apply.
- **Skill grants:** each skill's unconditional grants and permissions (SK-7), by skill ID.

**RD-2 · Must · M2: Permanent IDs.** Every entry in every file has a permanent ID separate from its display name. Users' records store IDs, so renaming never breaks them.

**RD-3 · Must · M2: Retire, never delete.** An entry leaving the game is marked *retired*. It can't be newly chosen, but records that use it stay readable.

**RD-4 · Must · M2: Checked in CI.** Every change to the reference data is checked:

- the format is valid;
- every reference points to an existing entry;
- there are no duplicate IDs or names;
- no entry that has been released disappears (retire it instead);
- the level chart has every level from 1 to its highest level for every class.

Invalid data can't be deployed.

**RD-5 · Must · M2: The level cap.** The highest level a character can have is the highest level in the level chart. Raising the cap (e.g. to 100) means adding rows to the chart, with no change to code or requirements. A chart change never lowers a character's level.

**RD-6 · Must · M2: The skill list is the app's own data.** The skill list is built from the maintainer's Warrior, Rogue and Mage artifacts, after their unclear prerequisites are cleaned up. From then on, the skill list file in the repository is the app's source: changes to skills are made there, by pull request. Keeping the artifacts in step with it is a maintainer task.

**RD-7 · Must · M2: Unclear entries.** Anything still unclear in a skill after the clean-up is recorded as a maintainer note in the skill list. It isn't shown to players: the app shows the skill as recorded.

**RD-8 · Must · M2: Game content in the public repository.** The repository is public, and its licence doesn't cover the game's content. Until the game's owner agrees (Q10), nothing from the game is committed: no skill or spell card text, and no level chart numbers. Tests are unaffected, since they use their own made-up reference data (TF-3). If the owner agrees to the app showing the text but not to publishing it, the text is kept out of the repository and loaded into the app another way, to be decided then.

## 14. Non-Functional Requirements

These describe *how well* the app must work, not what it does. **M2+** means the requirement applies from M2 onward.

**NF-1 · Must · M2+: Phone first.** Every screen works on a phone held upright (from 360 pixels wide), in Safari on iPhone and Chrome on Android, as well as on a computer. The common actions at the faire (marking used, equipping, ticking a task) take at most two taps from the character's page.

**NF-2 · Must · M2: Home screen.** The app can be added to the phone's home screen and opens full screen with its own icon. On iPhone it explains how (*Share → Add to Home Screen*) and why: Safari can clear a website's stored data after about 7 days without a visit, unless the site is on the home screen.

**NF-3 · Must · M3: Working offline.**

- After a user has opened the app with signal on a phone, everything in their account stays on that phone. Without signal they can view, search and export it, and make any change. Changes sync when signal returns.
- If two devices change the same field while offline, the change made later wins, whichever phone gets signal first. Quantity changes are combined (one *used* on each of two phones means two fewer). History records from both are kept. A clash that leaves too much equipped shows the over-limit alert (EQ-8).
- These need signal: signing in on a new device, creating an account, and browsing trade listings (later). Reports written offline are sent when signal returns.
- The app shows when it's offline and how many changes are waiting to sync.

**NF-4 · Must · M2+: Speed.**

- On a phone with ordinary mobile signal, a character's page opens within 2 seconds.
- After a change, totals and slot counts update in under 0.2 seconds.

**NF-5 · Must · M2+: Scale and cost.** The app is built for up to about 500 users, each with a few characters of a few hundred entries. At that size it runs on a free or low-cost hosting plan, and its costs are recorded in the brain's `services.md`.

**NF-6 · Must · M2+: Limits.** Text fields and counts have sensible maximums (e.g. a description of a few thousand characters, at most 1,000 entries per character), so a mistake or misuse can't run up hosting costs.

**NF-7 · Must · M2+: Security.**

- The server-side access rules (PV-1) are tested automatically against a local copy of the hosting service, never against production.
- Secrets live only in the host's secret store or the CI's secrets, never in the repository.
- Sign-in is handled by the hosting provider's own service, not built by us.

**NF-8 · Must · M2+: Times** are stored in UTC and shown in the user's local time.

**NF-9 · Should · M2+: Accessibility.** Text follows the phone's text size setting, colours have enough contrast (including in dark mode), and screens work with the phone's screen reader for the main tasks.

**NF-10 · Must · M3: Backups.** The database is backed up every night to separate storage, encrypted, and kept for 30 days. A restore is tested once before the first release, following a written runbook.

**NF-11 · Must · M3: Protected deployment.**

- Merging to `main` deploys, but only after CI passes.
- The GitHub account uses two-factor authentication, and `main` requires a pull request.
- Deploy credentials live only in a GitHub environment that only `main` can use.
- Dependabot keeps dependencies up to date.

**NF-12 · Must · M3: Error reports.** Errors in the app are reported to the maintainer automatically. Reports never include game records, display names or email addresses.

**NF-13 · Must · M3: Invite-only before 1.0.** Until release 1.0, only accounts on an allow list kept by the maintainer can sign up. Anyone else sees "not open yet". The list is removed at 1.0.

## 15. Testing

### 15.1 Tests first, and the test-change rule

**TF-1 · Must · M1: Tests first.** M1 writes the functional tests for every requirement, from this document alone, before any app logic exists. Tests check behaviour (e.g. "Aldric's total CM is 170", "Back: 2 equipped, 1 allowed"), not exact screen layout. The exception is the to-do list (section 11): its tests are written after Craig's review of that section, before M7 starts.

**TF-2 · Must · M1: The test harness, defined up front.** M1 fixes, as stubs with no logic, the interfaces the tests call:

- the **rules core:** pure functions with no database, network or screens, which work out totals, slots and allowances, over-limit alerts, skill availability and warnings;
- the **data layer**, with an in-memory fake;
- the **server-side access rules**, tested against the hosting service's local emulator;
- a **fake clock** in UTC;
- **fake sign-in**.

Later milestones implement these interfaces without changing them. An interface may gain an optional input, with a default that leaves every existing call's result unchanged, when a requirement change needs it.

**TF-3 · Must · M1: Fixtures.** Test data lives in `tests/fixtures/` as YAML: made-up users and characters (never real players), and a **test copy of the reference data** separate from the real files, so changing real data never breaks a test. It includes a sample character whose CM adds up to the GR-8 example.

**TF-4 · Must · M1: Traceability.** Every test names the requirement IDs it checks, and any DM question it depends on (e.g. Q1). An untagged test fails. A generated coverage table lists every requirement and its tests, and every *Must* has at least one. Requirement IDs are permanent: never renumbered or reused. A removed requirement keeps its place, marked *removed*. Requirements about how the work is done rather than how the app behaves (TF-12, TF-14, DOC-3) are marked *checked in review* in the coverage table instead of needing a test; the pull request's Review section reports them.

**TF-5 · Must · M1: Milestone markers.** Each test is marked with the milestone that implements it. Tests for unfinished milestones run as expected failures. Every test for a finished milestone must pass.

**TF-6 · Must · M1: The test-change rule.** A failing test means the **code** is wrong, unless Craig confirms the **test** is wrong. A test is never changed, deleted, skipped or weakened to make code pass. When a test seems wrong:

1. Ask Craig, explaining which test, what it expects, what seems wrong, and which requirement it traces to. Don't continue until Craig confirms.
2. Fix this document so it states the right behaviour.
3. Fix the test to match. Steps 2 and 3 are committed together, and the commit message names the requirement.
4. Fix the code until the test passes.

When a DM answers a question, start at step 2.

**TF-7 · Must · M1: Enforcement.**

- `CLAUDE.md` states the rule.
- Claude Code must ask before editing tests, fixtures, test settings, CI workflows, the check scripts or its own settings.
- CI fails any change that alters or removes an existing test, fixture or harness file unless the same change edits this document. Adding tests is always allowed.
- CI also fails if app code refers to the tests or test data.
- The check is required before merging to `main`.

**TF-8 · Must · M1: Assertions that can fail.**

- Each value is checked against what it belongs to: Aldric's CM, not "170 appears somewhere".
- A count is checked as that number.
- A refusal or block is checked to name what was refused.
- An access test checks that another user's read or write is **refused**, not just that the owner's works.

### 15.2 Kinds of test

**TF-9 · Must · M1: Rule scenarios.** The rules core is tested with YAML scenarios: a character's level, entries, grants and what's equipped, with the expected totals, slot counts, alerts and warnings. Every rule question that comes up becomes a permanent scenario.

**TF-10 · Must · M1: Property tests.** Thousands of generated characters check rules that must always hold:

- every total equals the sum of its breakdown lines;
- situational grants never change a total;
- unequipping or removing a source never raises a total or an allowance;
- the order in which entries were added doesn't change any result;
- normal equipping never exceeds a slot or allowance (only a lost grant can, and that always raises an alert).

**TF-11 · Must · M1: Access rule tests.** For every kind of record, the emulator tests check that the owner can read and write it, and another signed-in user can't. A listed trade entry is the one thing another user can read (PV-1), and nobody else can ever change it.

**TF-12 · Must · M2+: Proven by mutation.** New tests are proven by temporarily breaking the code they guard (a scripted mutation run that restores every file) and confirming they fail. The caught and survived counts are reported in the pull request, and tests that let a mutation survive are fixed.

**TF-13 · Should · M3: Phone-sized browser tests.** The main flows (sign in, add a character, add and use an entry, export) run automatically in a phone-sized browser.

**TF-14 · Must · M3: The 0.x trial.** Craig uses release 0.x at a faire. Every mismatch with his paper sheet is a bug, a rule modelled wrong, or a data error, and each becomes a new test or a data fix.

## 16. Milestones

Each milestone from M2 on is done when all of its tests from M1 pass, with no test changed except through the test-change rule (TF-6). Each milestone that changes behaviour raises the version in its own pull request: a minor version for features, a patch version for fixes. The user documentation is written as the app is built: from M3, every pull request that changes behaviour updates the pages that describe it (section 19).

| Milestone | Scope | Release |
|---|---|---|
| **M1: Functional tests** | The test harness with stubbed interfaces (TF-2); fixtures and the test reference data (TF-3); rule scenarios, property tests and access rule tests for every requirement; the coverage table; CI that runs them as expected failures and enforces the test-change rule. No app logic. | none |
| **M2: Core records** | Accounts and privacy (AC, PV); characters and titles (CH, TI-1 to TI-4); inventory (IN, except IN-11); skills from the list (SK-1 to SK-5, SK-8); history (HI-1 to HI-4); reference data and its CI checks (RD); home screen (NF-2). Runs in a test environment only. | none |
| **M3: Search, export and first release** | Search (SE), both exports (EX), working offline (NF-3), reports to the maintainer (SP-1 to SP-3), acquisition sources (IN-11), history filters (HI-5). Operations: hosting, protected deployment, backups with a tested restore, error reports, invite-only sign-up (NF-10 to NF-13); phone-sized browser tests (TF-13); the maintainer guide; the documentation site, with pages for everything built so far (section 19). Then Craig's trial (TF-14). | **0.x**, for Craig only |
| **M4: Equipping and totals** | Grants (GR-1 to GR-5); class bonus, CM, mitigation, hearts and dice (GR-7 to GR-12); paper doll, hands, arcane slots and over-limit alerts (EQ-1 to EQ-8); title grants (TI-5); skill grants and the record check (SK-6, SK-7). | 0.x |
| **M5: Permissions, rarity and 1.0** | Permissions and rarity (EQ-9 to EQ-11); effects as grants (GR-6); skill list changes (SK-9). Then a full review of the user documentation, and invite-only sign-up is lifted (NF-13). | **1.0**, open to players |
| **M6: Waiting on the DMs** | Quickslots, DM Arcane and ally rules (QS-1, DA-1, AL-1), each written out in full and approved once its DM answer arrives. | 1.x |
| **M7: Faire-day to-do list** | Reviewed with Craig first, then TD-1 to TD-6. | 1.x |


## 17. Open Questions

**Before setting up the project:**

- **The private reports repository** for SP-2: its name, created with the app's repository in step 3.

**Waiting on the DMs:** see [dm-rule-questions.md](dm-rule-questions.md):

- Q1: two-handed weapons and Dual Wielding
- Q2: two shields
- Q3: a bow plus a melee weapon
- Q4: consumables and quickslots
- Q5: the level needed for each rarity
- Q6: DM Arcane
- Q7: Divine and Mythic limits
- Q9: weapon groups
- Q11: familiars, allies and minions

**Waiting on the game's owner:** Q10, whether the app may show the skill and spell card text and use the level chart, and whether both may be published in the public repository (RD-8). The real reference data can't be committed until then.

**Waiting on Craig:** clean up the skill artifacts' unclear prerequisites, tiers and text before the skill list is built (RD-6).

**For later:**

- **Card scanning:** what's printed on the physical item cards (a QR code, or only text)?
- **Items given only online:** these have no card, and their record may be a post in Discord's rewards channel. How should they relate to scanning?
- **Long-term hosting:** if the app runs for years, who pays for it, holds its accounts, and fixes it when it's down, and how it's handed over if Craig steps away.

### Resolved

- **A web app, not a phone app:** Apple's fees and the need for a Mac rule out an iPhone app.
- **Titles are player-level by default,** and can be made character-level. Patreon tiers are recorded as titles.
- **No item catalog:** players type in items. Skills and spells come from the game's list.
- **Item family, component tier and weapon group** are free text with suggestions, since players and DMs make up their own.
- **Block what can be counted, warn about the rest:** slots, arcane slots and rarity limits are blocked; permissions and skill prerequisites only warn.
- **CM is one number,** including the class bonus. The old Attack/Defence split is gone.
- **Mitigation from several sources adds up,** with no maximum.
- **Starting arcane slots:** Warrior 0, Rogue 1, Mage 2, plus the level chart and grants.
- **Traded entries are copied, never moved:** the giver keeps a snapshot, and notes aren't passed on unless the giver chooses.
- **No zenni, no DM role, no combat tracking.**
- **Release 0.x at M3** for Craig's own trial, and **1.0 at M5**.
- **Tech stack:** a TypeScript web app on Firebase (section 20), chosen because the rules must run in the browser for offline use and instant totals. Working offline became a *Must* in M3 (NF-3).
- **Contacting the maintainer:** an in-app report form. Reports become issues in a separate private GitHub repository, except account problems, which stay in the database (SP-1 to SP-3).

## 18. Later

These features are planned but not scheduled. Each will be written out in full, and approved, before it's built.

**TR-1 · Could · later: Listing for trade.** A user can mark an entry *available for trade*, with the quantity offered. Listed entries are visible to every signed-in user (PV-1), showing only the fields in section 3.2.

**TR-2 · Could · later: Browsing listings.** Users can browse and search everyone's listed entries by name, category, rarity and item family. Arranging a trade happens outside the app (AC-4).

**TR-3 · Could · later: Transfer between accounts.**

- The giver chooses the recipient's account. The recipient **accepts** and picks which of their characters receives the entry.
- The app creates a **new entry** for the recipient with the card details (name, category, description, rarity, item family and fields such as slot or hands), and marks the giver's entry *traded*.
- The giver's history records "traded to *display name*" and the recipient's records "received from *display name*".
- Notes are copied only if the giver ticks *include my notes*.

**CS-1 · Could · later: Scanning item cards.** A player adds an entry by scanning a physical item card with the phone's camera. How depends on what's printed on the cards (section 17).

**LB-1 · Could · later: Lost entries.** An entry can be marked *lost*, recorded in the history like *traded*.

**LB-2 · Could · later: Broken entries.** An entry broken in play (e.g. by Shatter or Sunder) can be marked *broken*. It's unequipped and gives no grants until marked repaired, and it can add a to-do task to fix it at the guild hall.

**BB-1 · Could · later: Bonus bot link.** The app can pass a character's count of item-family items in use to the bonus bot, matching families by name, ignoring case. Linking an account to Discord comes first.

**IM-1 · Could · later: Import.** A user can import a JSON file in the app's own export format (EX-4), for example to restore a backup into a new account. Imports from other spreadsheets aren't planned, since every player's sheet is different.

## 19. User Documentation

**DOC-1 · Must · M3: Help inside the app.** The user guide is written as Markdown files in the repository's `docs/` folder and built into the app as help pages. Every main screen has a help link to its page. The help works wherever the app works, offline included.

**DOC-2 · Must · M3+: Pages.** The guide covers what's been built, growing with each milestone:

- getting started (signing up, adding the app to the home screen);
- characters and titles;
- the inventory (each category; used, traded and delete);
- skills;
- history;
- search and export, including the JSON format (EX-5);
- equipping and totals (from M4);
- permissions and rarity (from M5);
- the to-do list (from M7);
- the terms of use and privacy note (AC-4, PV-4);
- **troubleshooting:** every block and warning the app shows, and what to do about it;
- the glossary (section 2).

**DOC-3 · Must · M3+: Updated with the change.** Every pull request that changes behaviour updates the pages that describe it.

**DOC-4 · Must · M3: Examples come from the app.** Every example of the app's output in the guide (a CM breakdown, an over-limit alert, a JSON excerpt) is produced by the app's own code from a made-up sample character kept with the docs, never typed by hand. A script regenerates them, and CI fails if a committed example no longer matches. The sample character is separate from the test fixtures.

**DOC-5 · Must · M3: Maintainer guide.** `docs/maintainer.md`, in the repository only, lists every recurring task with its steps or a link to them:

- changing reference data, and rebuilding the skill list (RD-6);
- managing the invite list (NF-13);
- applying a DM's answer (TF-6);
- reviewing Dependabot pull requests;
- checking the app is running, and reading its error reports;
- backups and restoring (NF-10);
- renewing secrets;
- answering reports (SP-1 to SP-3): missing skills, bugs and ideas from the private issues repository, and account problems from the database;
- updating the guide.

**DOC-6 · Should · M3: Page dates.** Every help page shows when it was last **updated** (from git) and last **reviewed** (set by hand after someone checks the whole page against the app).

## 20. Technology

Chosen with Craig on 2026-11-09. The rules must run in the browser, for working offline (NF-3) and for instant totals (NF-4), so the app, its rules core and its tests share one language. This departs from the Python defaults in Craig's engineering rules for that reason.

| Part | Choice |
|---|---|
| App | TypeScript, React and Vite, installable to the home screen (`vite-plugin-pwa`) |
| Rules core | Plain TypeScript functions with no Firebase code (TF-2) |
| Sign-in | Firebase Authentication: Google, and email with password |
| Database | Cloud Firestore with its offline cache. Security rules enforce PV-1 and the invite list (NF-13). |
| Server code | Cloud Functions: reports to GitHub through a GitHub App (SP-2), report emails (SP-3), nightly backups (NF-10) |
| Hosting | Firebase Hosting, deployed from `main` by GitHub Actions after CI passes (NF-11) |
| Backups | A nightly Firestore export to a bucket in a separate Google Cloud project, deleted after 30 days |
| PDF | Created on the phone (`pdf-lib`) |
| Reference data | YAML files, validated with `zod` in CI (RD-4) |
| Error reports | Sentry, free plan, with personal data stripped (NF-12) |
| Tests | Vitest; `fast-check` for property tests; YAML scenarios; the Firestore emulator for access rules; Playwright for phone-sized browser tests |
| Plan and cost | A new Firebase project on the pay-as-you-go Blaze plan (needed for Cloud Functions), separate from the quest board's. Expected to cost $0 to $2 a month at NF-5's size, with a budget alert at $5. |

**Not chosen:**

- **Supabase:** no built-in offline sync, and its free plan pauses after a week without use.
- **A Python server on Fly.io:** working offline would be close to impossible, and the rules would need a second copy in the browser.
- **Flutter Web:** slow to load on weak signal, and it feels less natural in Safari.
