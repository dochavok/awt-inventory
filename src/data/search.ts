// Search (SE-1, SE-2): finds entries by name, description and notes, matching
// the start of a word as the user types, ignoring case. Pure functions.

import type { Character, Entry, ReferenceData } from "../rules/types";
import type { SearchResult } from "./types";

/** The words in a text, lower-cased: letters and digits, split at everything else. */
function words(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

/** True when every query word starts a word of `text`. */
function matches(tokens: string[], text: string | undefined): boolean {
  if (text === undefined) return false;
  const inText = words(text);
  return tokens.every((token) => inText.some((w) => w.startsWith(token)));
}

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
  const tokens = words(query);
  if (tokens.length === 0) return [];
  const results: SearchResult[] = [];
  for (const { character, entries } of characters) {
    for (const entry of entries) {
      const skill = entry.category === "skills" ? ref.skills.find((s) => s.id === entry.skillId) : undefined;
      const fields = {
        name: entry.category === "skills" ? (skill?.name ?? entry.skillId) : entry.name,
        // A skill's description is its card text, searched only where it may be shown (SK-2).
        description: entry.category === "skills" ? (showSkillText ? skill?.text : undefined) : entry.description,
        notes: entry.notes,
      };
      const matched = (["name", "description", "notes"] as const).filter((f) => matches(tokens, fields[f]));
      if (matched.length === 0) continue;
      results.push({
        entryId: entry.id,
        name: fields.name,
        category: entry.category,
        characterId: character.id,
        characterName: character.name,
        matched,
      });
    }
  }
  return results.sort((a, b) => a.characterName.localeCompare(b.characterName) || a.name.localeCompare(b.name));
}
