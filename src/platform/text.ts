// Text helpers for keeping personal details out of what leaves the app:
// error reports (NF-12) and issues made from reports (SP-2).

/** An email address anywhere in text. Global: use with `replace`. */
export const EMAIL_PATTERN = /[\w.+-]+@[\w-]+(\.[\w-]+)+/g;

/** Text with regular-expression characters escaped, to match it literally. */
export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
