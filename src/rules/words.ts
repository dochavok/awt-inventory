// How a search matches text (SE-1), shared by search and the skill picker
// (SK-1): ignoring case and accents, each word typed anywhere in a word.
// Pure functions.

/**
 * The words in a text, lower-cased and without accents (SE-1): letters and
 * digits, split at everything else. Accent marks are split off their letters
 * (NFD) and dropped, however the text was typed. Only the Latin accent marks
 * go: marks that make a different letter in other scripts stay.
 */
export function searchWords(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

/**
 * How `text` matches the words typed (from `searchWords`): every one starts one
 * of its words, every one is inside one, or not at all.
 */
export function matchWords(typed: string[], text: string | undefined): "start" | "inside" | undefined {
  if (text === undefined) return undefined;
  const inText = searchWords(text);
  if (typed.every((token) => inText.some((w) => w.startsWith(token)))) return "start";
  if (typed.every((token) => inText.some((w) => w.includes(token)))) return "inside";
  return undefined;
}
