// Search (SE-1, SE-2): finds entries by name, description and notes, matching
// anywhere in a word as the user types, ignoring case. Matches at the start of
// words come first. Pure functions.

import type { Character, Entry, ReferenceData } from "../rules/types";
import type { SearchResult } from "./types";

/**
 * The words in a text, lower-cased and without accents (SE-1): letters and
 * digits, split at everything else. Accent marks are split off their letters
 * (NFD) and dropped, however the text was typed.
 */
function words(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

/** The fields a search looks in. */
const FIELDS = ["name", "description", "notes"] as const;

/** How `text` matches the query: every query word starts one of its words, every one is inside one, or not at all. */
function match(tokens: string[], text: string | undefined): "start" | "inside" | undefined {
  if (text === undefined) return undefined;
  const inText = words(text);
  if (tokens.every((token) => inText.some((w) => w.startsWith(token)))) return "start";
  if (tokens.every((token) => inText.some((w) => w.includes(token)))) return "inside";
  return undefined;
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
      const kinds = FIELDS.map((f) => match(tokens, fields[f]));
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
