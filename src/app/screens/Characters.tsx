// Characters (section 4.1): the list, main and retired (CH-5); adding one
// (CH-1); and a character's page, where it's edited (CH-2, CH-3), its class
// corrected (CH-2a), retired or brought back (CH-5), or deleted (CH-6), with
// the titles that apply to it (TI-2).

import { useEffect, useState, type FormEvent } from "react";
import type { ClassCorrectionNotice } from "../../data/types";
import { LIMITS } from "../../data/validate";
import { NotFoundError } from "../../errors";
import { levelCap } from "../../rules/levels";
import { CLASS_NAMES, type Character, type ClassName, type Title } from "../../rules/types";
import { go, href } from "../router";
import type { Services } from "../services";
import { VerifyEmail } from "../Shell";
import { Feedback, useAction } from "../useAction";

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
      {lists && lists.main.length === 0 && <p className="hint">No characters yet.</p>}
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

export function CharacterPage({ services, id }: { services: Services; id: string }) {
  const { store } = services;
  const [character, setCharacter] = useState<Character | null>(null);
  const [titles, setTitles] = useState<Title[]>([]);
  const [missing, setMissing] = useState(false);
  const [panel, setPanel] = useState<"edit" | "class" | null>(null);
  const load = useAction();
  const action = useAction();

  const refresh = async () => {
    const [c, t] = await Promise.all([store.character(id), store.titlesFor(id)]);
    setCharacter(c);
    setTitles(t);
  };

  useEffect(() => {
    void load.run(async () => {
      try {
        await refresh();
      } catch (error) {
        if (!(error instanceof NotFoundError)) throw error;
        setMissing(true);
      }
    });
    // Load once when the page opens; App gives each character's page its own key.
  }, []);

  if (missing) {
    return (
      <>
        <h1>Character not found</h1>
        <p>
          This character isn&apos;t in your account. It may have been deleted on another phone.{" "}
          <a href={href("characters")}>See your characters</a>.
        </p>
      </>
    );
  }
  if (!character) {
    return (
      <>
        <Feedback error={load.error} notice={null} />
        {!load.error && <p className="hint">Loading…</p>}
      </>
    );
  }

  const done = async (message: string) => {
    await refresh();
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
      const patch: Partial<Pick<Character, "name" | "level" | "notes">> = {};
      if (name.trim() !== character.name) patch.name = name;
      if (Number(level) !== character.level) patch.level = Number(level);
      if (notes !== (character.notes ?? "")) patch.notes = notes;
      if (Object.keys(patch).length > 0) await store.updateCharacter(character.id, patch);
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
    void correct.run(async () => setNotice(await store.classCorrectionNotice(character.id, to)));
    // The warning for the class chosen.
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
