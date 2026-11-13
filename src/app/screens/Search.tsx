// Search (section 10.1): a character's entries in every category, skills
// included (SE-1), or every character's, retired ones too, each result naming
// its character (SE-2). Results update as the user types.

import { useEffect, useMemo, useRef, useState } from "react";
import type { SearchResult } from "../../data/types";
import { categoryName } from "../../data/validate";
import type { Character } from "../../rules/types";
import { href } from "../router";
import type { Services } from "../services";
import { messageFor } from "../messages";
import { Feedback } from "../useAction";
import { BackTo, CharacterNotFound, Loading, useScreenData } from "./common";

/** Where a result opens: an entry's own page, or the Skills screen for a skill. */
function resultAddress(r: SearchResult): string {
  return r.category === "skills"
    ? href(`characters/${r.characterId}/skills`)
    : href(`characters/${r.characterId}/entries/${r.entryId}`);
}

/** The scope for all of the user's characters, beside one character's ID. */
const ALL = "all";

/** Search one character's entries, or every character's when there's no `id`. */
export function Search({ services, id }: { services: Services; id?: string | undefined }) {
  // The character searched, if there is one; null while it's read.
  const screen = useScreenData(async () => (id === undefined ? undefined : services.store.character(id)));
  if (screen.missing) return <CharacterNotFound />;
  if (screen.data === null) return <Loading error={screen.error} />;
  return <SearchBox services={services} character={screen.data} />;
}

function SearchBox({ services, character }: { services: Services; character: Character | undefined }) {
  const { store } = services;
  const [query, setQuery] = useState("");
  const [everyone, setEveryone] = useState(character === undefined);
  // What's searched is read once for each scope, the first time it's needed, and then searched
  // as the user types without reading anything more (NF-5).
  const scope = character && !everyone ? character.id : ALL;
  const [searchers, setSearchers] = useState<Record<string, (query: string) => SearchResult[]>>({});
  // Why a scope's read failed, for that scope only; it's tried again on the next key.
  const [errors, setErrors] = useState<Record<string, string>>({});
  // Scopes being read, so each is read once at a time.
  const reading = useRef(new Set<string>());
  // Counts the reads thrown away; a read started before that is thrown away too when it ends.
  const generation = useRef(0);

  // NF-3: a change the server refused is undone on the phone, so what was read may hold it.
  // Everything is read again, and what's typed stays.
  useEffect(
    () =>
      services.onWriteRefused(() => {
        generation.current += 1;
        reading.current.clear();
        setSearchers({});
      }),
    [services],
  );

  useEffect(() => {
    if (searchers[scope] || reading.current.has(scope)) return;
    reading.current.add(scope);
    const started = generation.current;
    const current = () => generation.current === started;
    void store
      .searcher(scope === ALL ? { allCharacters: true } : { characterId: scope })
      .then(
        (search) => {
          if (!current()) return;
          setSearchers((all) => ({ ...all, [scope]: search }));
          setErrors((all) => ({ ...all, [scope]: "" }));
        },
        (error: unknown) => {
          if (current()) setErrors((all) => ({ ...all, [scope]: messageFor(error) }));
        },
      )
      .finally(() => {
        if (current()) reading.current.delete(scope);
      });
  }, [scope, query, searchers]);

  const search = searchers[scope];
  const error = (!search && errors[scope]) || null;
  const typed = query.trim() !== "";
  const results = useMemo(() => (search && typed ? search(query) : null), [search, query]);

  return (
    <>
      {character && <BackTo character={character} />}
      <h1>Search</h1>
      <form role="search" className="card" onSubmit={(e) => e.preventDefault()}>
        <label>
          Search
          <input
            type="search"
            // The screen is opened to search, so the box is ready to type in.
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <span className="hint">
            Names, descriptions and notes{everyone ? " of all your characters, retired ones too" : ""}.
          </span>
        </label>
        {character && (
          <label className="check">
            <input type="checkbox" checked={everyone} onChange={(e) => setEveryone(e.target.checked)} />
            Search all my characters
          </label>
        )}
      </form>
      <Feedback error={error} notice={null} />
      {typed && !search && !error && <p className="hint">Searching…</p>}
      {results?.length === 0 && <p className="hint">No results.</p>}
      {results && results.length > 0 && (
        <ul className="link-list results" aria-label="Results">
          {results.map((r) => (
            <li key={r.entryId}>
              <a href={resultAddress(r)}>
                <strong className="name">{r.name}</strong>
                <span className="hint">
                  {categoryName(r.category)}
                  {everyone && (
                    <>
                      {" · "}
                      <span className="name">{r.characterName}</span>
                    </>
                  )}
                  {!r.matched.includes("name") && ` · in its ${r.matched.join(" and ")}`}
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
