// Titles (section 4.2): adding one with a name, description and date earned
// (TI-1), player-level by default or one character's (TI-2), Patreon tiers as
// titles (TI-3), and editing or removing them (TI-4).

import { useEffect, useState, type FormEvent } from "react";
import { LIMITS } from "../../data/validate";
import type { Character, Title, TitleScope } from "../../rules/types";
import type { Services } from "../services";
import { Feedback, useAction } from "../useAction";

const PLAYER = "player";

/** What the add and edit forms hold. `appliesTo` is PLAYER (every character) or a character's ID. */
interface Fields {
  name: string;
  description: string;
  earned: string;
  appliesTo: string;
}

const EMPTY: Fields = { name: "", description: "", earned: "", appliesTo: PLAYER };

const fieldsOf = (title: Title): Fields => ({
  name: title.name,
  description: title.description ?? "",
  earned: title.earned ?? "",
  appliesTo: title.scope.level === "player" ? PLAYER : title.scope.characterId,
});

function toScope(value: string): TitleScope {
  return value === PLAYER ? { level: "player" } : { level: "character", characterId: value };
}

function TitleFields({
  characters,
  value,
  onChange,
}: {
  characters: Character[];
  value: Fields;
  onChange: (value: Fields) => void;
}) {
  const set = (field: keyof Fields) => (e: { target: { value: string } }) =>
    onChange({ ...value, [field]: e.target.value });
  return (
    <>
      <label>
        Name
        <input required maxLength={LIMITS.name} value={value.name} onChange={set("name")} />
      </label>
      <label>
        Description
        <textarea maxLength={LIMITS.description} value={value.description} onChange={set("description")} />
        <span className="hint">Optional, but worth adding: it&apos;s shown with the title.</span>
      </label>
      <label>
        Date earned
        <input type="date" value={value.earned} onChange={set("earned")} />
      </label>
      <label>
        Applies to
        <select value={value.appliesTo} onChange={set("appliesTo")}>
          <option value={PLAYER}>All characters</option>
          {value.appliesTo !== PLAYER && !characters.some((c) => c.id === value.appliesTo) && (
            <option value={value.appliesTo}>Only a character that&apos;s gone</option>
          )}
          {characters.map((c) => (
            <option key={c.id} value={c.id}>
              Only {c.name}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}

export function Titles({ services }: { services: Services }) {
  const { store } = services;
  const [titles, setTitles] = useState<Title[] | null>(null);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const load = useAction();
  const action = useAction();

  const refresh = async () => {
    const [t, main, retired] = await Promise.all([
      store.listTitles(),
      store.listCharacters("main"),
      store.listCharacters("retired"),
    ]);
    setTitles(t);
    setCharacters([...main, ...retired]);
  };

  useEffect(() => {
    void load.run(refresh);
    // Load once when the screen opens.
  }, []);

  const scopeText = (scope: TitleScope) => {
    if (scope.level === "player") return "All characters";
    const c = characters.find((ch) => ch.id === scope.characterId);
    return c ? `Only ${c.name}` : "Only a character that's gone";
  };

  return (
    <>
      <h1>Titles</h1>
      <p className="hint">
        Honours from the game, including Patreon tiers. A new title applies to all your characters; you can make it one
        character&apos;s instead.
      </p>
      <Feedback error={load.error} notice={null} />
      <AddTitle services={services} characters={characters} onAdded={() => void action.run(refresh)} />
      <Feedback error={action.error} notice={action.notice} />
      {titles && titles.length === 0 && <p className="hint">No titles yet.</p>}
      {titles && titles.length > 0 && (
        <ul className="cards" aria-label="Your titles">
          {titles.map((t) => (
            <li key={t.id} className="card">
              <strong className="name">{t.name}</strong>
              {t.description && <p>{t.description}</p>}
              {t.earned && <p className="hint">Earned {t.earned}</p>}
              <p className="hint">{scopeText(t.scope)}</p>
              {editing === t.id ? (
                <EditTitle
                  services={services}
                  title={t}
                  characters={characters}
                  onDone={() =>
                    void action.run(async () => {
                      setEditing(null);
                      await refresh();
                    })
                  }
                  onCancel={() => setEditing(null)}
                />
              ) : (
                <div className="actions">
                  <button type="button" className="secondary" onClick={() => setEditing(t.id)}>
                    Edit
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    disabled={action.busy}
                    onClick={() =>
                      void action.run(async () => {
                        await store.removeTitle(t.id);
                        await refresh();
                        return `${t.name} removed.`;
                      })
                    }
                  >
                    Remove
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function AddTitle({
  services,
  characters,
  onAdded,
}: {
  services: Services;
  characters: Character[];
  onAdded: () => void;
}) {
  const [fields, setFields] = useState(EMPTY);
  const add = useAction();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void add.run(async () => {
      await services.store.addTitle({
        name: fields.name,
        ...(fields.description.trim() ? { description: fields.description } : {}),
        ...(fields.earned ? { earned: fields.earned } : {}),
        scope: toScope(fields.appliesTo),
      });
      setFields(EMPTY);
      onAdded();
    });
  };

  return (
    <form className="card" aria-label="Add a title" onSubmit={submit}>
      <h2>Add a title</h2>
      <TitleFields characters={characters} value={fields} onChange={setFields} />
      <Feedback error={add.error} notice={null} />
      <button type="submit" disabled={add.busy}>
        Add title
      </button>
    </form>
  );
}

function EditTitle({
  services,
  title,
  characters,
  onDone,
  onCancel,
}: {
  services: Services;
  title: Title;
  characters: Character[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const { store } = services;
  const [fields, setFields] = useState(() => fieldsOf(title));
  const save = useAction();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void save.run(async () => {
      const before = fieldsOf(title);
      const patch: Partial<Pick<Title, "name" | "description" | "earned">> = {};
      if (fields.name.trim() !== before.name) patch.name = fields.name;
      if (fields.description !== before.description) patch.description = fields.description;
      if (fields.earned !== before.earned) patch.earned = fields.earned;
      if (Object.keys(patch).length > 0) await store.updateTitle(title.id, patch);
      if (fields.appliesTo !== before.appliesTo) await store.setTitleScope(title.id, toScope(fields.appliesTo));
      onDone();
    });
  };

  return (
    <form aria-label={`Edit ${title.name}`} onSubmit={submit}>
      <TitleFields characters={characters} value={fields} onChange={setFields} />
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
