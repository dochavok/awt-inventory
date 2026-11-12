// The user guide inside the app (DOC-1): every page from docs/, with when it
// was last updated and reviewed (DOC-6). Stored on the phone with the app, so
// it opens without signal.

import pages from "virtual:help-pages";
import type { Route } from "../router";
import { href } from "../router";

/** The guide's pages in reading order; any page not listed comes after, by title. */
const ORDER = [
  "getting-started",
  "characters-and-titles",
  "inventory",
  "skills",
  "history",
  "search-and-export",
  "troubleshooting",
  "glossary",
  "terms-of-use",
  "privacy",
];

const rank = (slug: string) => (ORDER.includes(slug) ? ORDER.indexOf(slug) : ORDER.length);
const ordered = [...pages].sort((a, b) => rank(a.slug) - rank(b.slug) || a.title.localeCompare(b.title));

export const helpPage = (slug: string) => pages.find((p) => p.slug === slug);

/**
 * The help page for the screen showing (DOC-1). Signed out, every screen but
 * Help and Privacy is the sign-in or sign-up screen, whose page is Getting started.
 */
export function helpFor(route: Route | null, signedIn: boolean): string {
  const screen = route?.screen;
  if (!signedIn && screen !== "help" && screen !== "privacy") return "help/getting-started";
  switch (screen) {
    case "characters":
    case "new-character":
    case "character":
    case "titles":
      return "help/characters-and-titles";
    case "privacy":
      return "help/privacy";
    case "help":
      return "help";
    default:
      return "help/getting-started";
  }
}

/** A page's body, from docs/ (our own Markdown, built into the app). */
export function DocBody({ html }: { html: string }) {
  return <div className="doc" dangerouslySetInnerHTML={{ __html: html }} />;
}

export function Help({ page }: { page?: string | undefined }) {
  if (page === undefined) {
    return (
      <>
        <h1>Help</h1>
        <ul className="link-list">
          {ordered.map((p) => (
            <li key={p.slug}>
              <a href={href(`help/${p.slug}`)}>{p.title}</a>
            </li>
          ))}
        </ul>
      </>
    );
  }
  const found = helpPage(page);
  if (!found) {
    return (
      <>
        <h1>Page not found</h1>
        <p>
          There&apos;s no help page here. <a href={href("help")}>See every page</a>.
        </p>
      </>
    );
  }
  return (
    <article>
      <h1>{found.title}</h1>
      <p className="hint">
        {found.updated && <>Updated {found.updated}</>}
        {found.updated && found.reviewed && " · "}
        {found.reviewed && <>Reviewed {found.reviewed}</>}
      </p>
      <DocBody html={found.html} />
      <p>
        <a href={href("help")}>Every page of the guide</a>
      </p>
    </article>
  );
}
