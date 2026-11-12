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

function git(args: string[], cwd: string): string {
  try {
    return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
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
  return git(["log", "-1", "--format=%cs", "--", file], root) || null;
}

/** Links between pages ("privacy.md") become the pages' addresses in the app. */
function linkPages(html: string): string {
  return html.replace(/href="([a-z0-9-]+)\.md(#[^"]*)?"/g, 'href="#/help/$1"');
}

export function readHelpPages(root: string): HelpPage[] {
  const dir = join(root, "docs");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md") && !NOT_HELP.includes(f))
    .sort()
    .map((file) => {
      const text = readFileSync(join(dir, file), "utf8");
      const title = TITLE.exec(text)?.[1]?.trim();
      if (!title) throw new Error(`docs/${file} has no "# " title`);
      const body = text.replace(TITLE, "").replace(REVIEWED, "");
      return {
        slug: file.replace(/\.md$/, ""),
        title,
        html: linkPages(marked.parse(body, { async: false })),
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
      const dir = join(root, "docs");
      for (const file of readdirSync(dir)) this.addWatchFile(join(dir, file));
      return `export default ${JSON.stringify(readHelpPages(root))};`;
    },
  };
}
