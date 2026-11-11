// Search (SE-1, SE-2): finds entries by name, description and notes, matching
// anywhere in a word as the user types, ignoring case. Matches at the start of
// words come first. Pure functions.

import type { Character, Entry, ReferenceData } from "../rules/types";
import type { SearchResult } from "./types";

/** The words in a text, lower-cased: letters and digits, split at everything else. */
function words(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

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
      const how = (["name", "description", "notes"] as const).map((f) => [f, match(tokens, fields[f])] as const);
      const matched = how.filter(([, m]) => m !== undefined).map(([f]) => f);
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
        start: how.some(([, m]) => m === "start"),
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
