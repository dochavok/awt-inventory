// Regenerates the user guide's examples from the made-up sample account in
// docs/sample/ (DOC-4), or checks they still match. Each example sits in a
// guide page between markers:
//
//   <!-- generated: NAME -->
//   ...
//   <!-- end generated: NAME -->
//
// The examples themselves are made in build/docs-examples.ts, so adding one
// doesn't change this protected script; the check that they match stays here.
//
//   npm run docs:write                    rewrite the examples in docs/
//   tsx scripts/generate-docs.ts --check  exit 1 if any is out of date (run by npm test)

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { docsExamples } from "../build/docs-examples";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const MARKED = /(<!-- generated: ([\w-]+) -->\n)[\s\S]*?(<!-- end generated: \2 -->)/g;
const mode = process.argv[2];

if (mode !== "--check" && mode !== "--write") {
  console.error("Usage: generate-docs.ts --check | --write");
  process.exit(2);
}

const made = await docsExamples(ROOT);
const used = new Set<string>();
const problems: string[] = [];
const changed: { file: string; text: string }[] = [];
const docs = join(ROOT, "docs");

for (const file of readdirSync(docs).filter((f) => f.endsWith(".md"))) {
  const before = readFileSync(join(docs, file), "utf8").replaceAll("\r\n", "\n");
  const after = before.replace(MARKED, (whole, start: string, name: string, end: string) => {
    used.add(name);
    const example = made[name];
    if (example === undefined) {
      problems.push(`docs/${file}: no example called "${name}"`);
      return whole;
    }
    return `${start}${example}\n${end}`;
  });
  if (after !== before) changed.push({ file: `docs/${file}`, text: after });
}
for (const name of Object.keys(made)) {
  if (!used.has(name)) problems.push(`no guide page has the "${name}" example`);
}

for (const problem of problems) console.error(problem);
if (mode === "--write") {
  for (const { file, text } of changed) {
    writeFileSync(join(ROOT, file), text);
    console.log(`Updated ${file}`);
  }
} else if (changed.length > 0) {
  for (const { file } of changed) console.error(`${file}: its examples don't match the app's output.`);
  console.error("Run `npm run docs:write` and commit the result.");
}
process.exit(problems.length > 0 || (mode === "--check" && changed.length > 0) ? 1 : 0);
