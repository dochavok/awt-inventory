// The in-app user guide (DOC-1, DOC-6): turns docs/*.md into the app's help
// pages at build time, as the module "virtual:help-pages". Each page has its
// title (the first "# " heading), its HTML, when it was last updated (from git)
// and when it was last reviewed (its "reviewed: YYYY-MM-DD" line, set by hand).
// The maintainer's own documents stay out of the app.

import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { marked } from "marked";
import type { Plugin } from "vite";

export interface HelpPage {
  /** The file name without ".md", used in the page's address: #/help/{slug}. */
  slug: string;
  title: string;
  html: string;
  /** YYYY-MM-DD, or null if git can't say. */
  updated: string | null;
  /** YYYY-MM-DD, or null if the page has no review date. */
  reviewed: string | null;
}

const MODULE = "virtual:help-pages";
const RESOLVED = `\0${MODULE}`;

/** Documents for the maintainer, in the repository only (DOC-5). */
export const NOT_HELP = ["maintainer.md", "restore-runbook.md"];

const REVIEWED = /^reviewed: (\d{4}-\d{2}-\d{2})$/m;
const TITLE = /^# (.+)$/m;

function git(args: string[], cwd: string, env: Record<string, string> = {}): string {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      env: { ...process.env, ...env },
    }).trim();
  } catch {
    return "";
  }
}

/**
 * When the page last changed: today (UTC) if it has changes not yet committed,
 * otherwise its last commit's date. Null outside a git checkout.
 */
function updated(file: string, root: string): string | null {
  if (git(["status", "--porcelain", "--", file], root) !== "") return new Date().toISOString().slice(0, 10);
  // The commit's date in UTC, like every other date the app keeps.
  return git(["log", "-1", "--date=format-local:%Y-%m-%d", "--format=%cd", "--", file], root, { TZ: "UTC" }) || null;
}

/**
 * Links between pages ("privacy.md", "privacy.md#part") become the pages' addresses in the
 * app, which open at the top of the page. A link to a file that isn't a help page fails the
 * build, so the app never shows a dead link.
 */
function linkPages(html: string, file: string, slugs: ReadonlySet<string>): string {
  return html.replace(/href="([^":]+)\.md(#[^"]*)?"/g, (_link, target: string) => {
    if (!slugs.has(target)) throw new Error(`docs/${file} links to ${target}.md, which isn't a help page`);
    return `href="#/help/${target}"`;
  });
}

/** Pages other screens show (Terms at sign-up, the Privacy screen): the build fails without them. */
const REQUIRED = ["terms-of-use", "privacy", "getting-started", "characters-and-titles"];

export function readHelpPages(root: string): HelpPage[] {
  const pages = readPages(root);
  const missing = REQUIRED.filter((slug) => !pages.some((p) => p.slug === slug));
  if (missing.length > 0) throw new Error(`docs/ has no ${missing.map((s) => `${s}.md`).join(", ")}`);
  return pages;
}

const docsDir = (root: string) => join(root, "docs");

function readPages(root: string): HelpPage[] {
  const dir = docsDir(root);
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".md") && !NOT_HELP.includes(f))
    .sort();
  const slugs = new Set(files.map((f) => f.replace(/\.md$/, "")));
  return files.map((file) => {
    const text = readFileSync(join(dir, file), "utf8");
    const title = TITLE.exec(text)?.[1]?.trim();
    if (!title) throw new Error(`docs/${file} has no "# " title`);
    const body = text.replace(TITLE, "").replace(REVIEWED, "");
    return {
      slug: file.replace(/\.md$/, ""),
      title,
      html: linkPages(marked.parse(body, { async: false }), file, slugs),
      updated: updated(`docs/${file}`, root),
      reviewed: REVIEWED.exec(text)?.[1] ?? null,
    };
  });
}

export function helpPages(root: string): Plugin {
  return {
    name: "awt-help-pages",
    resolveId(id) {
      return id === MODULE ? RESOLVED : undefined;
    },
    load(id) {
      if (id !== RESOLVED) return undefined;
      const dir = docsDir(root);
      for (const file of readdirSync(dir)) this.addWatchFile(join(dir, file));
      return `export default ${JSON.stringify(readHelpPages(root))};`;
    },
  };
}
