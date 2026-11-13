// Characters (section 4.1): the list, main and retired (CH-5); adding one
// (CH-1); and a character's page, where it's edited (CH-2, CH-3), its class
// corrected (CH-2a), retired or brought back (CH-5), or deleted (CH-6), with
// the titles that apply to it (TI-2) and links to its inventory, skills and
// history.

import { useEffect, useState, type FormEvent } from "react";
import type { ClassCorrectionNotice } from "../../data/types";
import { categoryName, LIMITS } from "../../data/validate";
import { levelCap } from "../../rules/levels";
import { CLASS_NAMES, type Category, type Character, type ClassName, type Entry } from "../../rules/types";
import { go, href } from "../router";
import type { Services } from "../services";
import { VerifyEmail } from "../Shell";
import { Feedback, useAction } from "../useAction";
import { CharacterNotFound, Loading, useScreenData } from "./common";

const describe = (c: Pick<Character, "className" | "level">) => `${c.className} · level ${c.level}`;

function CharacterList({ label, characters }: { label: string; characters: Character[] }) {
  return (
    <ul className="link-list" aria-label={label}>
      {characters.map((c) => (
        <li key={c.id}>
          <a href={href(`characters/${c.id}`)}>
            <strong className="name">{c.name}</strong>
            <span className="hint">{describe(c)}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}

export function Characters({ services }: { services: Services }) {
  const { store } = services;
  const [lists, setLists] = useState<{ main: Character[]; retired: Character[] } | null>(null);
  const load = useAction();

  useEffect(() => {
    void load.run(async () => {
      const [main, retired] = await Promise.all([store.listCharacters("main"), store.listCharacters("retired")]);
      setLists({ main, retired });
    });
    // Load once when the screen opens.
  }, []);

  return (
    <>
      <h1>Your characters</h1>
      <VerifyEmail auth={services.auth} />
      <Feedback error={load.error} notice={null} />
      <p>
        <a className="button" href={href("characters/new")}>
          Add a character
        </a>
      </p>
      {lists && lists.main.length === 0 && (
        <p className="hint">{lists.retired.length === 0 ? "No characters yet." : "No characters in your main list."}</p>
      )}
      {lists && lists.main.length > 0 && <CharacterList label="Main characters" characters={lists.main} />}
      {lists && lists.retired.length > 0 && (
        <>
          <h2>Retired</h2>
          <CharacterList label="Retired characters" characters={lists.retired} />
        </>
      )}
    </>
  );
}

export function NewCharacter({ services }: { services: Services }) {
  const { store, ref } = services;
  const [name, setName] = useState("");
  const [className, setClassName] = useState<ClassName>("Warrior");
  const [level, setLevel] = useState("1");
  const [notes, setNotes] = useState("");
  const add = useAction();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void add.run(async () => {
      const character = await store.createCharacter({
        name,
        className,
        level: Number(level),
        ...(notes.trim() ? { notes } : {}),
      });
      go(`characters/${character.id}`);
    });
  };

  return (
    <>
      <h1>New character</h1>
      <form className="card" onSubmit={submit}>
        <label>
          Name
          <input required maxLength={LIMITS.name} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          Class
          <select value={className} onChange={(e) => setClassName(e.target.value as ClassName)}>
            {CLASS_NAMES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <LevelInput value={level} onChange={setLevel} max={levelCap(ref)} />
        <label>
          Notes
          <textarea maxLength={LIMITS.notes} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
        <Feedback error={add.error} notice={null} />
        <button type="submit" disabled={add.busy}>
          Add character
        </button>
      </form>
    </>
  );
}

function LevelInput({ value, onChange, max }: { value: string; onChange: (v: string) => void; max: number }) {
  return (
    <label>
      Level
      <input
        type="number"
        inputMode="numeric"
        required
        min={1}
        max={max}
        step={1}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <span className="hint">From 1 to {max}.</span>
    </label>
  );
}

/** The links to a character's inventory, skills and history, in the glossary's order, with how many of each. */
const INVENTORY: Category[] = ["weapons", "armor", "skills", "allies", "consumables", "items", "components"];

function InventoryLinks({ id, entries }: { id: string; entries: Entry[] }) {
  const count = (category: Category) => entries.filter((e) => e.category === category && e.quantity > 0).length;
  return (
    <nav aria-label="Inventory" className="inventory-links">
      <ul className="link-list">
        {INVENTORY.map((category) => (
          <li key={category}>
            <a href={href(`characters/${id}/${category}`)}>
              {categoryName(category)} <span className="count">{count(category)}</span>
            </a>
          </li>
        ))}
        <li>
          <a href={href(`characters/${id}/history`)}>History</a>
        </li>
      </ul>
    </nav>
  );
}

export function CharacterPage({ services, id }: { services: Services; id: string }) {
  const { store } = services;
  // One read for the character, its entries (for the counts) and its titles (TI-2).
  const screen = useScreenData(() => store.sheet(id));
  const [panel, setPanel] = useState<"edit" | "class" | null>(null);
  const action = useAction();

  if (screen.missing) return <CharacterNotFound />;
  if (!screen.data) return <Loading error={screen.error} />;
  const { character, entries, titles } = screen.data;

  const done = async (message: string) => {
    await screen.refresh();
    setPanel(null);
    return message;
  };

  return (
    <>
      <h1 className="name">{character.name}</h1>
      <p>
        {describe(character)}
        {character.retired && <span className="tag">Retired</span>}
      </p>
      {character.notes && <p className="notes">{character.notes}</p>}
      <InventoryLinks id={character.id} entries={entries} />
      <Feedback error={action.error} notice={action.notice} />
      <div className="actions">
        <button type="button" className="secondary" onClick={() => setPanel(panel === "edit" ? null : "edit")}>
          Edit
        </button>
        <button
          type="button"
          className="secondary"
          disabled={action.busy}
          onClick={() =>
            void action.run(async () => {
              if (character.retired) {
                await store.restoreCharacter(id);
                return done(`${character.name} is back in your main list.`);
              }
              await store.retireCharacter(id);
              return done(`${character.name} is retired. Nothing in it has changed.`);
            })
          }
        >
          {character.retired ? "Bring back" : "Retire"}
        </button>
        <button type="button" className="secondary" onClick={() => setPanel(panel === "class" ? null : "class")}>
          Correct the class
        </button>
      </div>
      {panel === "edit" && (
        <EditCharacter
          services={services}
          character={character}
          onSaved={() => void action.run(() => done("Saved."))}
          onCancel={() => setPanel(null)}
        />
      )}
      {panel === "class" && (
        <CorrectClass
          services={services}
          character={character}
          onDone={() => void action.run(() => done("Class corrected. The change is in the history."))}
        />
      )}
      <section className="card" aria-labelledby="titles-title">
        <h2 id="titles-title">Titles</h2>
        {titles.length === 0 ? (
          <p className="hint">No titles.</p>
        ) : (
          <ul>
            {titles.map((t) => (
              <li key={t.id}>
                <strong>{t.name}</strong>
                {t.description && <span className="hint"> {t.description}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>
      <DeleteCharacter services={services} character={character} />
    </>
  );
}

function EditCharacter({
  services,
  character,
  onSaved,
  onCancel,
}: {
  services: Services;
  character: Character;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const { store, ref } = services;
  const [name, setName] = useState(character.name);
  const [level, setLevel] = useState(String(character.level));
  const [notes, setNotes] = useState(character.notes ?? "");
  const save = useAction();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void save.run(async () => {
      // The store changes only the fields that differ, so an unchanged one keeps its edit time (NF-3).
      await store.updateCharacter(character.id, { name, level: Number(level), notes });
      onSaved();
    });
  };

  return (
    <form className="card" aria-label={`Edit ${character.name}`} onSubmit={submit}>
      <label>
        Name
        <input required maxLength={LIMITS.name} value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <LevelInput value={level} onChange={setLevel} max={levelCap(ref)} />
      <label>
        Notes
        <textarea maxLength={LIMITS.notes} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
      <p className="hint">A change of level is recorded in the character&apos;s history.</p>
      <Feedback error={save.error} notice={null} />
      <div className="actions">
        <button type="submit" disabled={save.busy}>
          Save
        </button>
        <button type="button" className="secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function CorrectClass({
  services,
  character,
  onDone,
}: {
  services: Services;
  character: Character;
  onDone: () => void;
}) {
  const { store } = services;
  const others = CLASS_NAMES.filter((c) => c !== character.className);
  const [to, setTo] = useState<ClassName>(others[0]!);
  const [notice, setNotice] = useState<ClassCorrectionNotice | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const correct = useAction();

  useEffect(() => {
    setNotice(null);
    setConfirmed(false);
    // The warning for the class chosen; one that arrives after another class is chosen is dropped.
    let current = true;
    void correct.run(async () => {
      const latest = await store.classCorrectionNotice(character.id, to);
      if (current) setNotice(latest);
    });
    return () => {
      current = false;
    };
  }, [to]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void correct.run(async () => {
      await store.correctClass(character.id, to, { confirmed });
      onDone();
    });
  };

  return (
    <section className="card note" aria-labelledby="class-title">
      <h2 id="class-title">Correct the class</h2>
      <form onSubmit={submit}>
        <p>
          <strong>This isn&apos;t a normal change.</strong> The game has no way to change class: use this only to fix a
          mistake made when {character.name} was created.
        </p>
        <label>
          Correct the class to
          <select value={to} onChange={(e) => setTo(e.target.value as ClassName)}>
            {others.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        {notice && (
          <>
            <p>{notice.message}</p>
            <p>It changes:</p>
            <ul>
              {notice.affects.map((a) => (
                <li key={a}>{a === "own skill trees" ? "which skill trees are the character's own" : a}</li>
              ))}
            </ul>
          </>
        )}
        <label className="check">
          <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />I understand
          this fixes a mistake
        </label>
        <Feedback error={correct.error} notice={null} />
        <button type="submit" disabled={!confirmed || !notice || correct.busy}>
          Correct class
        </button>
      </form>
    </section>
  );
}

function DeleteCharacter({ services, character }: { services: Services; character: Character }) {
  const [typed, setTyped] = useState("");
  const remove = useAction();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void remove.run(async () => {
      await services.store.deleteCharacter(character.id, typed);
      go("characters");
    });
  };

  return (
    <form className="card danger" aria-labelledby="delete-character-title" onSubmit={submit}>
      <h2 id="delete-character-title">Delete this character</h2>
      <p>
        This removes {character.name} for good, with everything in it and its history, and titles that are only{" "}
        {character.name}&apos;s. It can&apos;t be undone. To stop playing a character but keep it, retire it instead.
      </p>
      <label>
        Type the character&apos;s name, {character.name}, to confirm
        <input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
      </label>
      <Feedback error={remove.error} notice={null} />
      <button type="submit" className="danger" disabled={remove.busy || typed.trim() !== character.name}>
        Delete character
      </button>
    </form>
  );
}
