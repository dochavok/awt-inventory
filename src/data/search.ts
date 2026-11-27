// Search (SE-1, SE-2): finds entries by name, description and notes, matching
// anywhere in a word as the user types, ignoring case and accents. Matches at
// the start of words come first. Pure functions.

import type { Character, Entry, ReferenceData } from "../rules/types";
import { matchWords, searchWords } from "../rules/words";
import type { ListFilter, SearchResult } from "./types";

/**
 * Whether an entry passes a category list's filters (SE-3): the rarity exactly, the item
 * family whatever its case. Equipped or active is M4's, checked by the store.
 */
export function matchesFilter(entry: Entry, { rarity, itemFamily }: Omit<ListFilter, "equipped">): boolean {
  if (rarity !== undefined && !("rarity" in entry && entry.rarity === rarity)) return false;
  return (
    itemFamily === undefined || ("itemFamily" in entry && entry.itemFamily?.toLowerCase() === itemFamily.toLowerCase())
  );
}

/** The fields a search looks in. */
const FIELDS = ["name", "description", "notes"] as const;

export interface Searchable {
  character: Character;
  /** Entries still in the inventory. */
  entries: Entry[];
}

export function searchEntries(
  query: string,
  characters: Searchable[],
  ref: ReferenceData,
  showSkillText: boolean,
): SearchResult[] {
  const tokens = searchWords(query);
  if (tokens.length === 0) return [];
  const results: { result: SearchResult; start: boolean }[] = [];
  for (const { character, entries } of characters) {
    for (const entry of entries) {
      const skill = entry.category === "skills" ? ref.skills.find((s) => s.id === entry.skillId) : undefined;
      const fields = {
        name: entry.category === "skills" ? (skill?.name ?? entry.skillId) : entry.name,
        // A skill's description is its card text, searched only where it may be shown (SK-2).
        description: entry.category === "skills" ? (showSkillText ? skill?.text : undefined) : entry.description,
        notes: entry.notes,
      };
      const kinds = FIELDS.map((f) => matchWords(tokens, fields[f]));
      const matched = FIELDS.filter((_, i) => kinds[i] !== undefined);
      if (matched.length === 0) continue;
      results.push({
        result: {
          entryId: entry.id,
          name: fields.name,
          category: entry.category,
          characterId: character.id,
          characterName: character.name,
          matched,
        },
        start: kinds.includes("start"),
      });
    }
  }
  return results
    .sort(
      (a, b) =>
        Number(b.start) - Number(a.start) ||
        a.result.characterName.localeCompare(b.result.characterName) ||
        a.result.name.localeCompare(b.result.name),
    )
    .map((r) => r.result);
}
