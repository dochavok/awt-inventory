// Titles (section 4.2): adding one with a name, description and date earned
// (TI-1), player-level by default or one character's (TI-2), Patreon tiers as
// titles (TI-3), and editing or removing them (TI-4).

import { useEffect, useState, type FormEvent } from "react";
import { LIMITS } from "../../data/validate";
import type { Character, Title, TitleScope } from "../../rules/types";
import type { Services } from "../services";
import { Feedback, useAction } from "../useAction";

const PLAYER = "player";

/** The "Applies to" choice: every character, or one. */
function scopeValue(scope: TitleScope): string {
  return scope.level === "player" ? PLAYER : scope.characterId;
}

function toScope(value: string): TitleScope {
  return value === PLAYER ? { level: "player" } : { level: "character", characterId: value };
}

function AppliesTo({
  characters,
  value,
  onChange,
}: {
  characters: Character[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label>
      Applies to
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value={PLAYER}>All characters</option>
        {characters.map((c) => (
          <option key={c.id} value={c.id}>
            Only {c.name}
          </option>
        ))}
      </select>
    </label>
  );
}

/** The fields a title is added or edited with. */
function TitleFields({
  name,
  description,
  earned,
  onName,
  onDescription,
  onEarned,
}: {
  name: string;
  description: string;
  earned: string;
  onName: (v: string) => void;
  onDescription: (v: string) => void;
  onEarned: (v: string) => void;
}) {
  return (
    <>
      <label>
        Name
        <input required maxLength={LIMITS.name} value={name} onChange={(e) => onName(e.target.value)} />
      </label>
      <label>
        Description
        <textarea maxLength={LIMITS.description} value={description} onChange={(e) => onDescription(e.target.value)} />
        <span className="hint">Optional, but worth adding: it&apos;s shown with the title.</span>
      </label>
      <label>
        Date earned
        <input type="date" value={earned} onChange={(e) => onEarned(e.target.value)} />
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
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [earned, setEarned] = useState("");
  const [appliesTo, setAppliesTo] = useState(PLAYER);
  const add = useAction();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void add.run(async () => {
      await services.store.addTitle({
        name,
        ...(description.trim() ? { description } : {}),
        ...(earned ? { earned } : {}),
        scope: toScope(appliesTo),
      });
      setName("");
      setDescription("");
      setEarned("");
      setAppliesTo(PLAYER);
      onAdded();
    });
  };

  return (
    <form className="card" aria-label="Add a title" onSubmit={submit}>
      <h2>Add a title</h2>
      <TitleFields
        name={name}
        description={description}
        earned={earned}
        onName={setName}
        onDescription={setDescription}
        onEarned={setEarned}
      />
      <AppliesTo characters={characters} value={appliesTo} onChange={setAppliesTo} />
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
  const [name, setName] = useState(title.name);
  const [description, setDescription] = useState(title.description ?? "");
  const [earned, setEarned] = useState(title.earned ?? "");
  const [appliesTo, setAppliesTo] = useState(scopeValue(title.scope));
  const save = useAction();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void save.run(async () => {
      const patch: Partial<Pick<Title, "name" | "description" | "earned">> = {};
      if (name.trim() !== title.name) patch.name = name;
      if (description !== (title.description ?? "")) patch.description = description;
      if (earned !== (title.earned ?? "")) patch.earned = earned;
      if (Object.keys(patch).length > 0) await store.updateTitle(title.id, patch);
      if (appliesTo !== scopeValue(title.scope)) await store.setTitleScope(title.id, toScope(appliesTo));
      onDone();
    });
  };

  return (
    <form aria-label={`Edit ${title.name}`} onSubmit={submit}>
      <TitleFields
        name={name}
        description={description}
        earned={earned}
        onName={setName}
        onDescription={setDescription}
        onEarned={setEarned}
      />
      <AppliesTo characters={characters} value={appliesTo} onChange={setAppliesTo} />
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
