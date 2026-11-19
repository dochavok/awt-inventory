# Equipping and totals

reviewed: 2026-11-19

A character's totals are never typed in. The app works them out from the level chart and from **grants**: what the character's equipped entries, skills, titles and manual grants add.

## Equipping

In a category's list, **Equip** puts an entry where it fits, in one tap: armor in its own slot, a two-handed weapon in both hands, a one-handed weapon in the Main hand (or the Off hand if the Main hand is taken), and an arcane item in an arcane slot. On an entry's own page you can choose which hand a one-handed weapon goes in. **Unequip** takes it off again; it stays in the inventory. Equipping and unequipping aren't recorded in the history.

- An entry is equipped in one place at a time, whatever its quantity. To hold a dagger in each hand, add them as two entries.
- A shield fits the Off hand. A character can't hold two shields, until the DMs say otherwise.
- A bow and a melee weapon can be held together.
- Consumables, components, skills and items that aren't arcane can't be equipped. Familiars and allies are made **active** instead, in their own form.

If there's no room, nothing changes and the app says which slot is full and what's in it. [Troubleshooting](troubleshooting.md) lists every reason equipping can be refused.

## The equipment page

**Equipment**, on the character's page, shows the paper doll: every slot (Head, Chest and the rest, plus Main hand and Off hand), with what's in it or *Empty*. A slot that comes from a grant is marked with where it comes from, such as "Back 2: from Title: Wanderer". Each equipped entry has **Unequip** there too.

Below it are the arcane items, with how many arcane slots are used, such as "Arcane slots: 3 of 4 used". A character's arcane slots are the class's starting number, plus one at each level where the level chart gives one, plus any arcane slot grants.

## Grants

A grant is one of: CM, mitigation, max hearts, an extra die (such as 1d6), extra slots of a kind (such as +1 Back), extra arcane slots, an allowance for a rarity (such as +1 Legendary), or a permission (Weapon Use, Ranged Weapon Use, Armor Use, Dual Wielding).

- **Weapons, armor, items and allies** get their grants on their own page, under **Grants**. They count only while the entry is equipped, or for an ally, while it's active.
- **Titles** get theirs on the Titles screen. A title for all your characters adds its grants to each of them; one character's title, only to that character.
- **Skills** bring their grants from the skill list. They always count.
- **Manual grants**, on the character's page, are for anything the app can't see, such as a DM's ruling. Each has a reason, and always counts.

A grant with a **condition**, such as "vs Evil" or "ranged weapons only", is *situational*: it's listed, but never added in. Some skills grow one die or bonus over several skills (such as a Holy Die); only the largest is used, and it stays situational unless a skill makes it always count.

Trading, unequipping or deleting a source takes its grants away at once.

## Totals

The character's page shows its totals, worked out again after every change:

- the **class bonus**, under its own name: Combat Bonus (Warrior), Arcane Bonus (Mage) or Stealth Bonus (Rogue). From level 10 a Rogue's Stealth Bonus is dice plus a number, such as 1d4 + 3, and it's always shown that way;
- **CM**: the class bonus's number plus every CM grant that counts, with a line for each kind of source: class bonus, Armor, Weapons, Skills, Ally, Items, Titles, Other (manual grants);
- **Mitigation**, the hearts taken off each hit, and **Max hearts**, from the level chart plus grants;
- the **combat dice**: the level chart's, then each extra die with where it comes from. A Rogue's Stealth Bonus dice are rolled with them.

Tap **Where CM comes from** (or mitigation, or max hearts) to see every grant in it: its source, the kind of source and the amount, with situational grants listed apart. For the made-up sample character Mirela, a level 9 Mage:

<!-- generated: totals-example -->
```text
Arcane Bonus 3
CM 6
  Arcane Bonus 3, Items 2, Titles 1
Mitigation 1
Max hearts 4
  Level chart 3, Other 1
Combat dice 1d20 + 1d6 (Moonlit Lantern)
```

**Where CM comes from:**

- Arcane Bonus · Class bonus · +3
- Moonlit Lantern · Items · +2
- Keeper of the Lanterns · Titles · +1

**Situational, not added in:**

- Starglass Circlet · Armor · +1 · vs Undead
<!-- end generated: totals-example -->

## Over-limit alerts

Losing a grant can leave a character with more equipped than it's now allowed: for example, trading the item that gave a second Back slot, moving a title to another character, or lowering the level. The app never unequips anything itself. Instead the character's page and its equipment page show an alert, naming the slot (or arcane slots), how many are equipped and allowed, and the grant that was lost where the app knows it. After Mirela traded the sash that gave her a second Back slot:

<!-- generated: alert-example -->
> Back: 2 equipped, 1 allowed. The extra slot came from Wayfarer's Sash, which you traded.
<!-- end generated: alert-example -->

Nothing more can be equipped there until you unequip enough to clear the alert.
