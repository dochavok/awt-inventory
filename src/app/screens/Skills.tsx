// Skills (section 6): a character's skills as the list describes them (SK-2),
// removing one (SK-4), and the picker: available skills first (SK-1a), every
// tree on request, search by name (SK-1), warnings that don't block (SK-3), and
// the link to report a skill that isn't listed (SK-5).

import { useEffect, useState, type FormEvent } from "react";
import { LIMITS } from "../../data/validate";
import { levelCap } from "../../rules/levels";
import {
  HOW_GAINED_NAMES,
  SKILL_TIER_NAMES,
  type Character,
  type HowGained,
  type SkillOption,
  type SkillPicker,
} from "../../rules/types";
import { href } from "../router";
import type { Services } from "../services";
import { offerUndo, UndoBar } from "../undo";
import { Feedback, useAction } from "../useAction";
import { BackTo, CharacterNotFound, LevelInput, Loading, useScreenData } from "./common";

/** How long the search waits after the last key before looking the skills up. */
const SEARCH_PAUSE_MS = 300;

export function Skills({ services, id }: { services: Services; id: string }) {
  const { store } = services;
  const screen = useScreenData(async () => {
    const [character, skills] = await Promise.all([store.character(id), store.skills(id)]);
    return { character, skills };
  });
  const [removing, setRemoving] = useState<string | null>(null);
  const action = useAction();

  if (screen.missing) return <CharacterNotFound />;
  if (!screen.data) return <Loading error={screen.error} />;
  const { character, skills } = screen.data;
  const reload = () => void action.run(screen.refresh);

  return (
    <>
      <BackTo character={character} />
      <h1>Skills</h1>
      <UndoBar at={`characters/${character.id}/skills`} onUndone={reload} />
      <Feedback error={action.error} notice={action.notice} />
      {skills.length === 0 ? (
        <p className="hint">No skills yet.</p>
      ) : (
        <ul className="cards" aria-label="Skills taken">
          {skills.map((s) => (
            <li key={s.entryId} className="card">
              <strong className="name">{s.name}</strong>
              {s.retired && <span className="tag">No longer in the list</span>}
              <p className="hint">
                {s.tree} · {s.usage} · {SKILL_TIER_NAMES[s.tier]}
              </p>
              <p>
                {HOW_GAINED_NAMES[s.howGained]}, level {s.levelGained}
              </p>
              {s.text && <p>{s.text}</p>}
              {s.notes && <p className="notes">{s.notes}</p>}
              {/* Removing asks first, then offers Undo, like deleting any entry (SK-4, IN-15). */}
              {removing === s.entryId ? (
                <>
                  <p>
                    Remove <span className="name">{s.name}</span> for good?
                  </p>
                  <div className="actions">
                    <button
                      type="button"
                      className="danger"
                      disabled={action.busy}
                      onClick={() =>
                        void action.run(async () => {
                          const { undo } = await store.deleteEntry(s.entryId);
                          offerUndo(`${s.name} removed.`, undo, `characters/${character.id}/skills`);
                          setRemoving(null);
                          await screen.refresh();
                        })
                      }
                    >
                      Remove for good
                    </button>
                    <button type="button" className="secondary" onClick={() => setRemoving(null)}>
                      Cancel
                    </button>
                  </div>
                </>
              ) : (
                <button type="button" className="secondary" onClick={() => setRemoving(s.entryId)}>
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <Picker
        services={services}
        character={character}
        version={skills.length}
        onAdded={(message) =>
          void action.run(async () => {
            await screen.refresh();
            return message;
          })
        }
      />
    </>
  );
}

function Picker({
  services,
  character,
  version,
  onAdded,
}: {
  services: Services;
  character: Character;
  /** Changes when the character's skills do, so what's available is read again. */
  version: number;
  onAdded: (message: string) => void;
}) {
  const { store, ref } = services;
  const [allTrees, setAllTrees] = useState(false);
  const [query, setQuery] = useState("");
  const [picker, setPicker] = useState<SkillPicker | null>(null);
  const [chosen, setChosen] = useState<SkillOption | null>(null);
  const load = useAction();

  useEffect(() => {
    // Each look-up reads the character's entries (NF-5), so typing waits for a pause first.
    // Only the latest search is shown, however the replies arrive.
    let current = true;
    const timer = setTimeout(
      () =>
        void load.run(async () => {
          const found = await store.skillPicker(character.id, { allTrees, ...(query.trim() ? { query } : {}) });
          if (current) setPicker(found);
        }),
      query ? SEARCH_PAUSE_MS : 0,
    );
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [allTrees, query, version]);

  const treeName = (tree: string) => ref.trees.find((t) => t.id === tree)?.name ?? tree;
  const options = (label: string, list: SkillOption[]) =>
    list.length > 0 && (
      <>
        <h3>{label}</h3>
        <ul className="link-list" aria-label={label}>
          {list.map((o) => (
            <li key={o.skillId}>
              <button type="button" className="option" onClick={() => setChosen(o)}>
                {o.name}
              </button>
              <span className="hint">
                {" "}
                {treeName(o.tree)}
                {o.taken > 0 && ` · taken ${o.taken === 1 ? "once" : `${o.taken} times`}`}
              </span>
            </li>
          ))}
        </ul>
      </>
    );

  return (
    <section className="card" aria-labelledby="add-skill-title">
      <h2 id="add-skill-title">Add a skill</h2>
      <label>
        Search skills
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} />
      </label>
      <label className="check">
        <input type="checkbox" checked={allTrees} onChange={(e) => setAllTrees(e.target.checked)} />
        Show every tree
      </label>
      <Feedback error={load.error} notice={null} />
      {picker && (
        <>
          {options("Available now", picker.available)}
          {options("Other skills", picker.others)}
          {picker.available.length === 0 && picker.others.length === 0 && <p className="hint">No skills match.</p>}
        </>
      )}
      {chosen && (
        <AddSkill
          key={chosen.skillId}
          services={services}
          character={character}
          skill={chosen}
          onDone={(message) => {
            setChosen(null);
            onAdded(message);
          }}
        />
      )}
      <p>
        <a href={href("report/missing-skill")}>Not listed? Tell the maintainer</a>
      </p>
    </section>
  );
}

function AddSkill({
  services,
  character,
  skill,
  onDone,
}: {
  services: Services;
  character: Character;
  skill: SkillOption;
  onDone: (message: string) => void;
}) {
  const [howGained, setHowGained] = useState<HowGained>("level-up");
  const [level, setLevel] = useState(String(character.level));
  const [notes, setNotes] = useState("");
  const add = useAction();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void add.run(async () => {
      const { warnings } = await services.store.addSkill(character.id, {
        skillId: skill.skillId,
        howGained,
        levelGained: Number(level),
        ...(notes.trim() ? { notes } : {}),
      });
      onDone(
        warnings.length === 0
          ? `${skill.name} added.`
          : `${skill.name} added. DMs sometimes allow this, but note: ${warnings.map((w) => w.message).join(" ")}`,
      );
    });
  };

  return (
    <form aria-label={`Add ${skill.name}`} onSubmit={submit}>
      <h3 className="name">{skill.name}</h3>
      <label>
        How gained
        <select value={howGained} onChange={(e) => setHowGained(e.target.value as HowGained)}>
          {Object.entries(HOW_GAINED_NAMES).map(([value, name]) => (
            <option key={value} value={value}>
              {name}
            </option>
          ))}
        </select>
      </label>
      <LevelInput label="Level gained" value={level} onChange={setLevel} max={levelCap(services.ref)} />
      <label>
        Notes
        <textarea maxLength={LIMITS.notes} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
      <Feedback error={add.error} notice={null} />
      <button type="submit" disabled={add.busy}>
        Add skill
      </button>
    </form>
  );
}
