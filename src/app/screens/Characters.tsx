// Characters (section 4.1): the list, main and retired (CH-5); adding one
// (CH-1); and a character's page, where it's edited (CH-2, CH-3), its class
// corrected (CH-2a), retired or brought back (CH-5), or deleted (CH-6), with
// the titles that apply to it (TI-2), the effects it has now (GR-6), and links
// to its inventory, skills and history.

import { useEffect, useState, type FormEvent } from "react";
import type { ClassCorrectionNotice } from "../../data/types";
import { categoryName, LIMITS } from "../../data/validate";
import { levelCap } from "../../rules/levels";
import { computeTotals } from "../../rules/totals";
import {
  CATEGORIES,
  CLASS_NAMES,
  type Category,
  type Character,
  type ClassName,
  type Entry,
  type ManualGrant,
  type Totals,
} from "../../rules/types";
import { effectLines, grantText, totalsView } from "../grant-text";
import { go, href } from "../router";
import type { Services } from "../services";
import { VerifyEmail } from "../Shell";
import { Feedback, useAction } from "../useAction";
import { CharacterNotFound, LevelInput, Loading, useScreenData } from "./common";
import { Alerts } from "./Equipment";
import { GrantForm } from "./grants";

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
        </a>{" "}
        <a className="button secondary" href={href("search")}>
          Search all characters
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

/**
 * The links to a character's equipment, then its inventory, skills and history, in the
 * glossary's order, with how many of each.
 */
function InventoryLinks({ id, entries }: { id: string; entries: Entry[] }) {
  // The sheet's entries are those still in the inventory.
  const count = (category: Category) => entries.filter((e) => e.category === category).length;
  return (
    <nav aria-label="Inventory" className="inventory-links">
      <ul className="link-list">
        <li>
          <a href={href(`characters/${id}/equipment`)}>Equipment</a>
        </li>
        {CATEGORIES.map((category) => (
          <li key={category}>
            <a href={href(`characters/${id}/${category}`)}>
              {categoryName(category)} <span className="count">{count(category)}</span>
            </a>
          </li>
        ))}
        <li>
          <a href={href(`characters/${id}/history`)}>History</a>
        </li>
        <li>
          <a href={href(`characters/${id}/search`)}>Search</a>
        </li>
      </ul>
    </nav>
  );
}

export function CharacterPage({ services, id }: { services: Services; id: string }) {
  const { store, ref } = services;
  // The character, its entries (for the counts and totals) and its titles (TI-2), with its alerts.
  const screen = useScreenData(() => store.sheetWithAlerts(id));
  const [panel, setPanel] = useState<"edit" | "class" | null>(null);
  const action = useAction();

  if (screen.missing) return <CharacterNotFound />;
  if (!screen.data) return <Loading error={screen.error} />;
  const { sheet, alerts } = screen.data;
  const { character, entries, titles } = sheet;
  const totals = computeTotals(sheet, ref);
  const effects = effectLines(totals, ref);

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
      <Alerts alerts={alerts} />
      {/* GR-6: the effects that apply now, with their sources, above the character's notes. */}
      {effects.length > 0 && (
        <section className="card" aria-labelledby="effects-title">
          <h2 id="effects-title">Effects</h2>
          <ul>
            {effects.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </section>
      )}
      {character.notes && <p className="notes">{character.notes}</p>}
      <TotalsCard totals={totals} />
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
        <a className="button secondary" href={href(`export/${character.id}`)}>
          Print or export
        </a>
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
      <ManualGrants
        services={services}
        characterId={character.id}
        manualGrants={sheet.manualGrants}
        onChanged={screen.refresh}
      />
      <DeleteCharacter services={services} character={character} />
    </>
  );
}

/**
 * GR-7 to GR-12: the class bonus on its own line, each total with its breakdown, and a
 * button for each that opens every grant in it, situational ones apart; then the combat dice,
 * and the damage with where it comes from (GR-13).
 */
function TotalsCard({ totals }: { totals: Totals }) {
  const view = totalsView(totals);
  const [open, setOpen] = useState<string | null>(null);
  return (
    <section className="card totals" aria-labelledby="totals-title">
      <h2 id="totals-title">Totals</h2>
      <p className="total">{view.classBonus}</p>
      {view.totals.map((t) => (
        <div key={t.label} className="total-block">
          <p className="total">{t.heading}</p>
          {t.breakdown && <p className="hint">{t.breakdown}</p>}
          <button
            type="button"
            className="link-button"
            aria-expanded={open === t.label}
            onClick={() => setOpen(open === t.label ? null : t.label)}
          >
            {`Where ${t.label} comes from`}
          </button>
          {open === t.label && (
            <>
              {t.grants.length === 0 ? (
                <p className="hint">Nothing adds to it.</p>
              ) : (
                <ul aria-label={`Grants in ${t.label}`}>
                  {t.grants.map((g, i) => (
                    <li key={i}>{g}</li>
                  ))}
                </ul>
              )}
              <Situational label={t.label} lines={t.situational} />
            </>
          )}
        </div>
      ))}
      <p className="total">{view.dice}</p>
      {view.situationalDice.length > 0 && (
        <p className="hint">Situational dice, not rolled every time: {view.situationalDice.join(", ")}</p>
      )}
      {/* GR-13: the base and each extra damage that counts; situational ones apart, never added in. */}
      <div className="total-block">
        <p className="total">{view.damage.heading}</p>
        <ul aria-label="Damage">
          {view.damage.lines.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
        <Situational label="Damage" lines={view.damage.situational} />
      </div>
    </section>
  );
}

/** GR-4: the situational grants that would affect a total, listed apart; nothing when there are none. */
function Situational({ label, lines }: { label: string; lines: string[] }) {
  if (lines.length === 0) return null;
  return (
    <>
      <h3>Situational, not added in</h3>
      <ul aria-label={`Situational for ${label}`}>
        {lines.map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ul>
    </>
  );
}

/** GR-2: grants added straight to the character, each with its reason. */
function ManualGrants({
  services,
  characterId,
  manualGrants,
  onChanged,
}: {
  services: Services;
  characterId: string;
  manualGrants: ManualGrant[];
  onChanged: () => Promise<void>;
}) {
  const { store, ref } = services;
  const remove = useAction();
  return (
    <section className="card" aria-labelledby="manual-title">
      <h2 id="manual-title">Manual grants</h2>
      <p className="hint">
        For what the app can&apos;t see, such as a DM&apos;s ruling. Each has a reason, and always counts.
      </p>
      {manualGrants.length > 0 && (
        <ul className="grant-list" aria-label="Manual grants">
          {manualGrants.map((m) => (
            <li key={m.id}>
              <span>
                <strong>{m.reason}</strong>: {/* Not commas: an effect's own text may have them (GR-6). */}
                {m.grants.map((g) => grantText(g, ref)).join(" · ")}
              </span>
              <button
                type="button"
                className="secondary"
                aria-label={`Remove ${m.reason}`}
                disabled={remove.busy}
                onClick={() =>
                  void remove.run(async () => {
                    await store.removeManualGrant(characterId, m.id);
                    await onChanged();
                  })
                }
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      <Feedback error={remove.error} notice={null} />
      <GrantForm
        services={services}
        label="Add a manual grant"
        button="Add manual grant"
        withReason
        onAdd={async (grant, reason) => {
          await store.addManualGrant(characterId, reason, [grant]);
          await onChanged();
        }}
      />
    </section>
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
