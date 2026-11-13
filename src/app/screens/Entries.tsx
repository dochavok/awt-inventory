// The inventory (section 5): a category's entries (IN-9), with Used on
// consumables and components (IN-12, two taps from the character's page,
// NF-1); adding an entry with where it came from (IN-1 to IN-7, IN-10, IN-11);
// and an entry's page, where it's edited (IN-8), used with a date or note,
// traded or given away (IN-14), or deleted with Undo (IN-15).

import { useEffect, useId, useState, type FormEvent } from "react";
import type { EntryListItem, EntryPatch, GainOptions, NewEntry } from "../../data/types";
import { categoryName, LIMITS } from "../../data/validate";
import type { Character, ItemEntry, ReferenceData } from "../../rules/types";
import { go, href, type ItemCategory } from "../router";
import type { Services } from "../services";
import { offerUndo, UndoBar } from "../undo";
import { Feedback, useAction } from "../useAction";
import { BackTo, CharacterNotFound, Loading, pickedDate, today, useScreenData } from "./common";

/** Only consumables and components can be marked used (IN-12). */
const usable = (category: ItemCategory) => category === "consumables" || category === "components";

const categoryAddress = (characterId: string, category: ItemCategory) => `characters/${characterId}/${category}`;

// ---------------------------------------------------------------- a category's list

export function Category({ services, id, category }: { services: Services; id: string; category: ItemCategory }) {
  const { store } = services;
  const screen = useScreenData(async () => {
    const [character, items] = await Promise.all([store.character(id), store.listEntries(id, category)]);
    return { character, items };
  });
  const [adding, setAdding] = useState(false);
  const action = useAction();

  if (screen.missing) return <CharacterNotFound />;
  if (!screen.data) return <Loading error={screen.error} />;
  const { character, items } = screen.data;
  const reload = () => void action.run(screen.refresh);

  const used = (entry: ItemEntry) =>
    void action.run(async () => {
      await store.markUsed(entry.id);
      await screen.refresh();
      const left = entry.quantity - 1;
      return left > 0 ? `Used one ${entry.name}: ${left} left.` : `Used the last ${entry.name}.`;
    });

  return (
    <>
      <BackTo character={character} />
      <h1>{categoryName(category)}</h1>
      <UndoBar onUndone={reload} />
      <Feedback error={action.error} notice={action.notice} />
      <EntryList category={category} items={items} busy={action.busy} onUsed={used} />
      {items.length === 0 && <p className="hint">Nothing here yet.</p>}
      {adding ? (
        <EntryForm
          services={services}
          character={character}
          category={category}
          onDone={(message) =>
            void action.run(async () => {
              setAdding(false);
              await screen.refresh();
              return message;
            })
          }
          onCancel={() => setAdding(false)}
        />
      ) : (
        <p>
          <button type="button" onClick={() => setAdding(true)}>
            Add an entry
          </button>
        </p>
      )}
    </>
  );
}

function EntryList({
  category,
  items,
  busy,
  onUsed,
}: {
  category: ItemCategory;
  items: EntryListItem[];
  busy: boolean;
  onUsed: (entry: ItemEntry) => void;
}) {
  if (items.length === 0) return null;
  return (
    <ul className="entry-list" aria-label={categoryName(category)}>
      {items.map(({ entry, equipped }) => {
        if (entry.category === "skills") return null;
        return (
          <li key={entry.id}>
            <a href={href(`characters/${entry.characterId}/entries/${entry.id}`)}>
              <strong className="name">{entry.name}</strong>
            </a>
            <span className="quantity">× {entry.quantity}</span>
            {equipped && <span className="tag">{entry.category === "allies" ? "Active" : "Equipped"}</span>}
            {usable(category) && (
              <button
                type="button"
                className="secondary"
                aria-label={`Mark one ${entry.name} used`}
                disabled={busy}
                onClick={() => onUsed(entry)}
              >
                Used
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

// ---------------------------------------------------------------- the entry form

/** What the entry form holds, as typed. */
interface Fields {
  name: string;
  quantity: string;
  description: string;
  notes: string;
  itemFamily: string;
  rarity: string;
  hands: string;
  range: string;
  weaponGroup: string;
  extraDamage: string;
  slotKind: string;
  arcane: boolean;
  allyType: string;
  hearts: string;
  active: boolean;
  tier: string;
  /** Where it came from, its link and when (IN-11, HI-3): for adding, or raising the quantity. */
  source: string;
  link: string;
  gained: string;
}

const chooseable = <T extends { retired?: boolean }>(list: T[]) => list.filter((x) => !x.retired);

function fieldsOf(entry: ItemEntry | undefined, ref: ReferenceData): Fields {
  const e = (entry ?? {}) as Record<string, unknown>;
  const text = (key: string) => (typeof e[key] === "string" ? (e[key] as string) : "");
  const count = (key: string) => (typeof e[key] === "number" ? String(e[key]) : "");
  return {
    name: text("name"),
    quantity: entry ? String(entry.quantity) : "1",
    description: text("description"),
    notes: text("notes"),
    itemFamily: text("itemFamily"),
    rarity: text("rarity"),
    hands: e.hands === 2 ? "2" : "1",
    range: e.range === "ranged" ? "ranged" : "melee",
    weaponGroup: text("weaponGroup"),
    extraDamage: count("extraDamage"),
    slotKind: text("slotKind") || (chooseable(ref.slotKinds)[0]?.id ?? ""),
    arcane: e.arcane === true,
    allyType: text("allyType"),
    hearts: count("hearts"),
    active: e.active === true,
    tier: text("tier"),
    source: "",
    link: "",
    gained: "",
  };
}

/**
 * The entry as the store takes it, adding or editing. Text goes as typed: the store
 * trims it, and empty text means none (or clears it when editing).
 */
function entryFrom(category: ItemCategory, f: Fields): Record<string, unknown> {
  const count = (value: string) => (value.trim() === "" ? undefined : Number(value));
  const base = {
    category,
    name: f.name,
    quantity: Number(f.quantity),
    description: f.description,
    notes: f.notes,
    itemFamily: f.itemFamily,
  };
  switch (category) {
    case "weapons":
      return {
        ...base,
        rarity: f.rarity,
        hands: Number(f.hands),
        range: f.range,
        weaponGroup: f.weaponGroup,
        extraDamage: count(f.extraDamage),
      };
    case "armor":
      return { ...base, rarity: f.rarity, slotKind: f.slotKind };
    case "items":
      return { ...base, rarity: f.rarity, arcane: f.arcane };
    case "allies":
      return { ...base, allyType: f.allyType, hearts: count(f.hearts), active: f.active };
    case "components":
      return { ...base, tier: f.tier };
    case "consumables":
      return base;
  }
}

type SuggestionField = Parameters<Services["store"]["suggestions"]>[0];

/** Earlier values and common ones for the form's free-text fields (IN-2, IN-3, IN-6, IN-7, IN-11). */
function useSuggestions(services: Services, fields: SuggestionField[]) {
  const [found, setFound] = useState<Partial<Record<SuggestionField, string[]>>>({});
  useEffect(() => {
    let current = true;
    void Promise.all(fields.map(async (f) => [f, await services.store.suggestions(f)] as const)).then(
      (pairs) => current && setFound(Object.fromEntries(pairs)),
      // Suggestions only help: without them, the fields still take any text.
      () => undefined,
    );
    return () => {
      current = false;
    };
    // Read once when the form opens.
  }, []);
  return found;
}

const SUGGESTED: Record<ItemCategory, SuggestionField[]> = {
  weapons: ["itemFamily", "weaponGroup", "acquisitionSource"],
  armor: ["itemFamily", "acquisitionSource"],
  items: ["itemFamily", "acquisitionSource"],
  allies: ["itemFamily", "allyType", "acquisitionSource"],
  consumables: ["itemFamily", "acquisitionSource"],
  components: ["itemFamily", "componentTier", "acquisitionSource"],
};

function TextField({
  label,
  value,
  onChange,
  max = LIMITS.shortText,
  suggestions,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  max?: number;
  suggestions?: string[] | undefined;
  required?: boolean;
}) {
  const listId = useId();
  return (
    <label>
      {label}
      <input
        required={required}
        maxLength={max}
        value={value}
        list={suggestions ? listId : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
      {suggestions && (
        <datalist id={listId}>
          {suggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      )}
    </label>
  );
}

function CountField({
  label,
  value,
  onChange,
  min,
  max,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  min: number;
  max: number;
  required?: boolean;
}) {
  return (
    <label>
      {label}
      <input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        step={1}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

function RarityField({ value, onChange, ref }: { value: string; onChange: (v: string) => void; ref: ReferenceData }) {
  return (
    <label>
      Rarity
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">None</option>
        {chooseable(ref.rarities)
          .concat(ref.rarities.filter((r) => r.retired && r.id === value))
          .map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
      </select>
    </label>
  );
}

/** Adding an entry to a category (no `entry`), or editing one. */
function EntryForm({
  services,
  character,
  category,
  entry,
  onDone,
  onCancel,
}: {
  services: Services;
  character: Character;
  category: ItemCategory;
  entry?: ItemEntry;
  onDone: (message: string) => void;
  onCancel: () => void;
}) {
  const { store, ref } = services;
  const [f, setF] = useState(() => fieldsOf(entry, ref));
  const suggestions = useSuggestions(services, SUGGESTED[category]);
  const save = useAction();
  const set =
    <K extends keyof Fields>(key: K) =>
    (value: Fields[K]) =>
      setF((old) => ({ ...old, [key]: value }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void save.run(async () => {
      const gain: GainOptions = {};
      if (f.source.trim()) gain.source = f.source;
      if (f.link.trim()) gain.link = f.link.trim();
      const date = pickedDate(f.gained);
      if (date) gain.date = date;
      const fields = entryFrom(category, f);
      if (entry) {
        await store.updateEntry(entry.id, fields as EntryPatch, gain);
        onDone("Saved.");
      } else {
        const added = await store.addEntry(character.id, fields as unknown as NewEntry, gain);
        onDone(`${added.name} added.`);
      }
    });
  };

  return (
    <form className="card" aria-label={entry ? `Edit ${entry.name}` : "New entry"} onSubmit={submit}>
      {!entry && <h2>New entry</h2>}
      <TextField label="Name" value={f.name} onChange={set("name")} max={LIMITS.name} required />
      <CountField
        label="Quantity"
        value={f.quantity}
        onChange={set("quantity")}
        min={1}
        max={LIMITS.quantity}
        required
      />
      {category === "weapons" && (
        <>
          <label>
            Hands
            <select value={f.hands} onChange={(e) => set("hands")(e.target.value)}>
              <option value="1">One-handed</option>
              <option value="2">Two-handed</option>
            </select>
          </label>
          <label>
            Range
            <select value={f.range} onChange={(e) => set("range")(e.target.value)}>
              <option value="melee">Melee</option>
              <option value="ranged">Ranged</option>
            </select>
          </label>
          <TextField
            label="Weapon group"
            value={f.weaponGroup}
            onChange={set("weaponGroup")}
            suggestions={suggestions.weaponGroup}
          />
          <CountField
            label="Extra damage (hearts)"
            value={f.extraDamage}
            onChange={set("extraDamage")}
            min={0}
            max={LIMITS.extraDamage}
          />
        </>
      )}
      {category === "armor" && (
        <label>
          Slot
          <select value={f.slotKind} onChange={(e) => set("slotKind")(e.target.value)}>
            {ref.slotKinds
              .filter((s) => !s.retired || s.id === f.slotKind)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
          </select>
        </label>
      )}
      {category === "items" && (
        <label className="check">
          <input type="checkbox" checked={f.arcane} onChange={(e) => set("arcane")(e.target.checked)} />
          Arcane
        </label>
      )}
      {category === "allies" && (
        <>
          <TextField label="Type" value={f.allyType} onChange={set("allyType")} suggestions={suggestions.allyType} />
          <CountField label="Hearts" value={f.hearts} onChange={set("hearts")} min={0} max={LIMITS.hearts} />
          <label className="check">
            <input type="checkbox" checked={f.active} onChange={(e) => set("active")(e.target.checked)} />
            Active
          </label>
        </>
      )}
      {category === "components" && (
        <TextField label="Tier" value={f.tier} onChange={set("tier")} suggestions={suggestions.componentTier} />
      )}
      {(category === "weapons" || category === "armor" || category === "items") && (
        <RarityField value={f.rarity} onChange={set("rarity")} ref={ref} />
      )}
      <TextField
        label="Item family"
        value={f.itemFamily}
        onChange={set("itemFamily")}
        suggestions={suggestions.itemFamily}
      />
      <label>
        Description
        <textarea
          maxLength={LIMITS.description}
          value={f.description}
          onChange={(e) => set("description")(e.target.value)}
        />
        <span className="hint">The card&apos;s text.</span>
      </label>
      <label>
        Notes
        <textarea maxLength={LIMITS.notes} value={f.notes} onChange={(e) => set("notes")(e.target.value)} />
      </label>
      <fieldset>
        <legend>{entry ? "If you're raising the quantity" : "How it was gained (optional)"}</legend>
        <TextField
          label="Where it came from"
          value={f.source}
          onChange={set("source")}
          suggestions={suggestions.acquisitionSource}
        />
        <label>
          Link
          <input
            type="url"
            inputMode="url"
            maxLength={LIMITS.link}
            value={f.link}
            onChange={(e) => set("link")(e.target.value)}
          />
          <span className="hint">Such as the post in Discord&apos;s rewards channel.</span>
        </label>
        <label>
          Date gained
          <input type="date" max={today()} value={f.gained} onChange={(e) => set("gained")(e.target.value)} />
          <span className="hint">Leave empty for today.</span>
        </label>
      </fieldset>
      <Feedback error={save.error} notice={null} />
      <div className="actions">
        <button type="submit" disabled={save.busy}>
          {entry ? "Save" : "Add entry"}
        </button>
        <button type="button" className="secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------- an entry's page

function details(entry: ItemEntry, ref: ReferenceData): [string, string][] {
  const named = (list: { id: string; name: string }[], id: string) => list.find((x) => x.id === id)?.name ?? id;
  const rows: [string, string | undefined][] = [
    ["Quantity", `× ${entry.quantity}`],
    ["Description", entry.description],
    ["Notes", entry.notes],
    ["Item family", entry.itemFamily],
  ];
  switch (entry.category) {
    case "weapons":
      rows.push(
        ["Hands", entry.hands === 2 ? "Two-handed" : "One-handed"],
        ["Range", entry.range === "ranged" ? "Ranged" : "Melee"],
        ["Weapon group", entry.weaponGroup],
        [
          "Extra damage",
          entry.extraDamage === undefined
            ? undefined
            : `${entry.extraDamage} ${entry.extraDamage === 1 ? "heart" : "hearts"}`,
        ],
      );
      break;
    case "armor":
      rows.push(["Slot", named(ref.slotKinds, entry.slotKind)]);
      break;
    case "items":
      rows.push(["Arcane", entry.arcane ? "Yes" : "No"]);
      break;
    case "allies":
      rows.push(
        ["Type", entry.allyType],
        ["Hearts", entry.hearts === undefined ? undefined : String(entry.hearts)],
        ["Active", entry.active ? "Yes" : "No"],
      );
      break;
    case "components":
      rows.push(["Tier", entry.tier]);
      break;
    case "consumables":
      break;
  }
  if ("rarity" in entry && entry.rarity) rows.push(["Rarity", named(ref.rarities, entry.rarity)]);
  return rows.filter((r): r is [string, string] => r[1] !== undefined && r[1] !== "");
}

export function EntryPage({ services, id, entryId }: { services: Services; id: string; entryId: string }) {
  const { store, ref } = services;
  const screen = useScreenData(async () => {
    const [character, entry] = await Promise.all([store.character(id), store.entry(entryId)]);
    return { character, entry };
  });
  const [panel, setPanel] = useState<"edit" | "delete" | null>(null);
  const action = useAction();

  if (screen.missing) return <CharacterNotFound />;
  if (!screen.data) return <Loading error={screen.error} />;
  const { character, entry } = screen.data;
  if (entry.category === "skills" || entry.characterId !== character.id) {
    return (
      <>
        <BackTo character={character} />
        <h1>Entry not found</h1>
        <p>This entry isn&apos;t in {character.name}&apos;s inventory.</p>
      </>
    );
  }
  const list = categoryAddress(character.id, entry.category);
  if (entry.quantity <= 0) {
    return (
      <>
        <BackTo character={character} />
        <h1 className="name">{entry.name}</h1>
        <p>
          {entry.name} is no longer in the inventory. Its records are in the{" "}
          <a href={href(`characters/${character.id}/history`)}>history</a>.
        </p>
      </>
    );
  }

  /** After a change: the entry's page again, or its list if none is left. */
  const after = async (left: number, message: string) => {
    if (left <= 0) {
      go(list);
      return;
    }
    await screen.refresh();
    setPanel(null);
    return message;
  };

  return (
    <>
      <BackTo character={character} />
      <h1 className="name">{entry.name}</h1>
      <p className="hint">
        <a href={href(list)}>{categoryName(entry.category)}</a>
      </p>
      <Feedback error={action.error} notice={action.notice} />
      <dl className="details">
        {details(entry, ref).map(([term, value]) => (
          <div key={term}>
            <dt>{term}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <div className="actions">
        <button type="button" className="secondary" onClick={() => setPanel(panel === "edit" ? null : "edit")}>
          Edit
        </button>
      </div>
      {panel === "edit" && (
        <EntryForm
          services={services}
          character={character}
          category={entry.category}
          entry={entry}
          onDone={(message) => void action.run(() => after(entry.quantity, message))}
          onCancel={() => setPanel(null)}
        />
      )}
      {usable(entry.category) && (
        <UseForm
          key={entry.quantity}
          services={services}
          entry={entry}
          onDone={(left, m) => void action.run(() => after(left, m))}
        />
      )}
      <TradeForm
        key={`trade-${entry.quantity}`}
        services={services}
        entry={entry}
        onDone={(left, m) => void action.run(() => after(left, m))}
      />
      <section className="card danger" aria-labelledby="delete-entry-title">
        <h2 id="delete-entry-title">Delete</h2>
        <p>For an entry added by mistake. It leaves no trace: its history goes with it.</p>
        {panel === "delete" ? (
          <>
            <p>
              Delete <span className="name">{entry.name}</span> for good?
            </p>
            <div className="actions">
              <button
                type="button"
                className="danger"
                disabled={action.busy}
                onClick={() =>
                  void action.run(async () => {
                    const { undo } = await store.deleteEntry(entry.id);
                    offerUndo(`${entry.name} deleted.`, undo);
                    go(list);
                  })
                }
              >
                Delete for good
              </button>
              <button type="button" className="secondary" onClick={() => setPanel(null)}>
                Cancel
              </button>
            </div>
          </>
        ) : (
          <button type="button" className="danger" onClick={() => setPanel("delete")}>
            Delete entry
          </button>
        )}
      </section>
    </>
  );
}

/** IN-12 with a date or note (HI-3). */
function UseForm({
  services,
  entry,
  onDone,
}: {
  services: Services;
  entry: ItemEntry;
  onDone: (left: number, message: string) => void;
}) {
  const [day, setDay] = useState("");
  const [note, setNote] = useState("");
  const use = useAction();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void use.run(async () => {
      const date = pickedDate(day);
      await services.store.markUsed(entry.id, { ...(date ? { date } : {}), ...(note.trim() ? { note } : {}) });
      onDone(entry.quantity - 1, `Used one ${entry.name}.`);
    });
  };

  return (
    <form className="card" aria-label="Mark used" onSubmit={submit}>
      <h2>Used, with a date or note</h2>
      <label>
        Date
        <input type="date" max={today()} value={day} onChange={(e) => setDay(e.target.value)} />
        <span className="hint">Leave empty for today.</span>
      </label>
      <label>
        Note
        <input maxLength={LIMITS.notes} value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      <Feedback error={use.error} notice={null} />
      <button type="submit" disabled={use.busy}>
        Mark used
      </button>
    </form>
  );
}

/** IN-14: all or part of the quantity. */
function TradeForm({
  services,
  entry,
  onDone,
}: {
  services: Services;
  entry: ItemEntry;
  onDone: (left: number, message: string) => void;
}) {
  const [kind, setKind] = useState<"traded" | "given-away">("traded");
  const [quantity, setQuantity] = useState(String(entry.quantity));
  const [who, setWho] = useState("");
  const [day, setDay] = useState("");
  const trade = useAction();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void trade.run(async () => {
      const count = Number(quantity);
      const date = pickedDate(day);
      await services.store.markTraded(entry.id, {
        kind,
        quantity: count,
        ...(who.trim() ? { note: who } : {}),
        ...(date ? { date } : {}),
      });
      onDone(entry.quantity - count, `${kind === "traded" ? "Traded" : "Gave away"} ${count} × ${entry.name}.`);
    });
  };

  return (
    <form className="card" aria-label="Trade or give away" onSubmit={submit}>
      <h2>Traded or given away</h2>
      <label>
        What happened
        <select value={kind} onChange={(e) => setKind(e.target.value as "traded" | "given-away")}>
          <option value="traded">Traded</option>
          <option value="given-away">Given away</option>
        </select>
      </label>
      <CountField label="Quantity" value={quantity} onChange={setQuantity} min={1} max={entry.quantity} required />
      <label>
        Who to
        <input maxLength={LIMITS.notes} value={who} onChange={(e) => setWho(e.target.value)} />
      </label>
      <label>
        Date
        <input type="date" max={today()} value={day} onChange={(e) => setDay(e.target.value)} />
        <span className="hint">Leave empty for today.</span>
      </label>
      <Feedback error={trade.error} notice={null} />
      <button type="submit" disabled={trade.busy}>
        Record
      </button>
    </form>
  );
}
