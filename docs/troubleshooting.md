# Troubleshooting

reviewed: 2026-11-28

Every refusal and warning the app shows, and what to do about it.

## Any text

- **"The … has a broken character, such as half of an emoji":** text pasted from elsewhere can be cut off in the middle of an emoji. Delete the odd character at the cut, or type the text again.

## Signing up and signing in

- **"Not open yet":** until release 1.0 only invited email addresses can sign up. Ask the maintainer to add yours. If you see it after verifying your email, your address was taken off the list since you signed up: once it's added back, open the app again and your account is finished. **Sign out** leaves in the meantime.
- **Nothing can be saved:** an email account must be verified first. Open the link in the email the app sent, then choose **I've verified it**. **Send the email again** sends a new one.
- **"Finish creating your account":** your email is verified, but this phone didn't keep the display name you chose at sign-up (you signed up on another phone, or reset your password). Choose a display name, accept the terms, and choose **Finish**.
- **"That email and password don't match an account":** check both, or choose **Forgot your password?**.

## Characters

- **"You already have a character called …":** your characters must have different names, ignoring capitals. Choose another name, or rename the other character first.
- **Deleting is greyed out:** type the character's name exactly as it's shown, capitals included.
- **"… is already a …":** a class correction must pick a different class.
- **A level the app won't take:** a level is from 1 up to the highest level in the level chart.

## Inventory

- **"A link must be a web address":** a link with an entry you gained starts with `http://` or `https://`, such as the address of a post in Discord's rewards channel.
- **"It's too late to undo":** **Undo** is offered for about 10 seconds after deleting an entry. After that, add the entry again.
- **"That use … was restored already":** each use can be restored once.
- **"… is no longer in the inventory":** a use can't be restored once the rest of the entry was deleted. Add it again instead.

## Equipping

When equipping is refused, nothing changes, and the app says why. See [Equipping and totals](equipping-and-totals.md).

- **Wrong slot** ("… fits Chest, not Back"): armor goes only in the slot it fits; a one-handed weapon in the Main hand or the Off hand; a two-handed weapon in both hands; an arcane item in an arcane slot. If the entry's slot or hands are wrong, edit the entry. A slot the game no longer uses takes nothing new.
- **Slot full** ("Back is full: … is in it"): every slot of that kind is taken. Unequip what's there first, or add a grant if something gives the character another slot of that kind.
- **Hands not free** ("… needs both hands free"): a two-handed weapon needs both hands empty. Unequip what's in them. For a one-handed weapon, "Both hands are full: …" says what's in each hand.
- **Two shields** ("a character can't hold two shields"): until the DMs answer, a character holds one shield at most.
- **Not arcane** ("… isn't arcane, so it can't go in an arcane slot"): only arcane items go in arcane slots. If the item is arcane, edit it and tick **Arcane**.
- **Arcane full** ("Arcane slots are full: 4 of 4 used"): unequip another arcane item first. A character gains arcane slots from the level chart and from grants.
- **Over limit** ("Back: 2 equipped, 1 allowed. Unequip 1 to clear the alert."): the character lost a grant, or two of your phones equipped the same slot without signal, so more is equipped there than it's now allowed. Nothing more goes in until you unequip enough.
- **Cannot equip** ("… can't be equipped"): consumables, components, skills and items that aren't arcane are never equipped. Familiars and allies are made active instead, in their own form.
- **Already equipped** ("… is already equipped in …"): an entry is in one place at a time. Unequip it first to move it.

## Grants

- **"… isn't a kind of grant"** or **"… doesn't have a …":** choose the kind again; each kind has its own fields.
- **A grant's amount** is a whole number of 1 or more (at most 10 slots in one grant). An extra die is written like `1d6`.
- **"… entries can't have grants":** only weapons, armor, items and familiars or allies have grants. Skills bring theirs from the skill list.
- **"… can have at most 50 grants":** one entry, title or manual grant holds at most 50, and a character at most 50 manual grants.
- **A manual grant needs a reason,** such as "DM ruling, Faire 2026".

## Without signal

- **"The server refused the character …, so it's been undone on this phone":** while this phone was offline, another of your phones gave a character the same name and reached the server first. The character from this phone, with anything added to it here, wasn't kept. Add it again under another name.
- **"The server refused a change …":** the change didn't reach your account. Make it again with signal.
- **Changes waiting:** the bar at the top counts changes not yet sent. They go when there's signal; keep the app open for a moment once you're back online.

## New versions

- **"A new version is ready":** tap **Reload** to switch to it, once you've saved anything you're typing.
- **Something new isn't there yet:** the app looks for a new version only with signal. Open it with signal, or bring it back from the background, and wait for the bar.
- **The app stopped with an error:** once a fixed version comes out, the app switches to it by itself, while it's open with signal.

## Skill warnings

Warnings never stop you adding a skill: DMs sometimes allow these. Check with your DM if you're not sure.

- **Missing prerequisite:** a skill it needs isn't on the character ("needs …"). Add the prerequisite first if the character has it.
- **Another class:** the skill is from another class's tree.
- **Entry level:** the character's level is below the tree's entry level.
- **Already has it:** the character has the skill already and can't take it again, or has taken it as often as it allows.
- **Not in the list:** skills that aren't in the list can't be added. Use **Not listed? Tell the maintainer** in the skill picker.

## Reporting a problem

If something here doesn't help, tell the maintainer: choose **Send a report** on your account page, or **Not listed? Tell the maintainer** in the skill picker for a missing or wrong skill. Pick the kind of report (missing or wrong skill, bug, idea, or account problem), write a subject and what happened, and name the character if it's about one. The app shows the report's number, which the maintainer can refer to.

- You can send up to 15 reports a day. The day starts at midnight UTC (for example, 7 PM in Chicago in summer), so a refusal says when you can send more, in your own time.
- A report written without signal is sent when signal returns.
- An account problem isn't posted anywhere: the maintainer is told only its number and ID.
- Other reports are tracked by their kind, number, ID and the app's version, never by what you wrote; the maintainer reads what you wrote in the app's database.
