// The in-app help pages as the build makes them from docs/ (DOC-1): links
// between pages become the pages' addresses in the app, and a link to a page
// that isn't in the app fails the build rather than showing a dead link.
// Each test builds from its own made-up docs/ folder.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect } from "vitest";
import { readHelpPages } from "../../build/help-pages";
import { rule } from "../support/rule";

/** The pages other screens show, which every docs/ folder must have. */
const REQUIRED = {
  "terms-of-use.md": "# Terms of use\n",
  "privacy.md": "# Privacy\n\n## Who can see it\n",
  "getting-started.md": "# Getting started\n",
  "characters-and-titles.md": "# Characters and titles\n",
};

/** Builds the help pages from a made-up docs/ folder holding `pages` as well as the required ones. */
function build(pages: Record<string, string>) {
  const root = mkdtempSync(join(tmpdir(), "awt-help-"));
  try {
    mkdirSync(join(root, "docs"));
    for (const [file, text] of Object.entries({ ...REQUIRED, ...pages })) writeFileSync(join(root, "docs", file), text);
    return readHelpPages(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

rule(
  { req: ["DOC-1"], m: "M3" },
  "a link to another help page, with or without a part of it, opens that page in the app",
  () => {
    const pages = build({
      "skills.md": "# Skills\n\nSee [privacy](privacy.md) and [who can see it](privacy.md#who-can-see-it).\n",
    });
    const html = pages.find((p) => p.slug === "skills")?.html ?? "";
    expect(html, "the Skills page's link to Privacy").toContain('<a href="#/help/privacy">privacy</a>');
    expect(html, "the Skills page's link to a part of Privacy").toContain(
      '<a href="#/help/privacy">who can see it</a>',
    );
  },
);

rule({ req: ["DOC-1"], m: "M3" }, "a link to a help page that doesn't exist fails the build, naming it", () => {
  expect(
    () => build({ "skills.md": "# Skills\n\nSee [the inventory](inventory.md).\n" }),
    "building with a link to inventory.md",
  ).toThrow(/skills\.md.*inventory\.md/);
});

rule(
  { req: ["DOC-1", "DOC-5"], m: "M3" },
  "a link to the maintainer's guide, which isn't in the app, fails the build, naming it",
  () => {
    expect(
      () =>
        build({
          "skills.md": "# Skills\n\nAsk the [maintainer](maintainer.md).\n",
          "maintainer.md": "# Maintainer guide\n",
        }),
      "building with a link to maintainer.md",
    ).toThrow(/skills\.md.*maintainer\.md/);
  },
);
