// Search (section 10.1): a character's entries in every category, skills
// included (SE-1), or every character's, retired ones too, each result naming
// its character (SE-2). Results update as the user types.

import { useEffect, useMemo, useState } from "react";
import type { SearchResult } from "../../data/types";
import { categoryName } from "../../data/validate";
import type { Character } from "../../rules/types";
import { href } from "../router";
import type { Services } from "../services";
import { Feedback, useAction } from "../useAction";
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
  const look = useAction();

  useEffect(() => {
    if (searchers[scope]) return;
    void look.run(async () => {
      const search = await store.searcher(scope === ALL ? { allCharacters: true } : { characterId: scope });
      setSearchers((all) => ({ ...all, [scope]: search }));
    });
  }, [scope]);

  const search = searchers[scope];
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
      <Feedback error={look.error} notice={null} />
      {typed && !search && !look.error && <p className="hint">Searching…</p>}
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
