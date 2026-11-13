// Regenerates the user guide's examples from the made-up sample account in
// docs/sample/ (DOC-4), or checks they still match. The examples themselves
// are made in build/docs-examples.ts.
//
//   npm run docs:write                    rewrite the examples in docs/
//   tsx scripts/generate-docs.ts --check  exit 1 if any is out of date (run by npm test)

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkDocs } from "../build/docs-examples";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const mode = process.argv[2];

if (mode !== "--check" && mode !== "--write") {
  console.error("Usage: generate-docs.ts --check | --write");
  process.exit(2);
}

const { changed, problems } = await checkDocs(ROOT);
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
