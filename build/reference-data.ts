// The reference data (section 13) for the app, read and checked at build time
// (RD-4): data/*.yaml through loadReferenceData, as the module
// "virtual:reference-data". The app gets plain JSON, so it carries no YAML
// parser or schema checker (NF-4), and data with any problem fails the build,
// so it can't be deployed.

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { Plugin } from "vite";
import { loadReferenceData } from "../src/refdata";
import type { ReferenceData } from "../src/rules/types";

const MODULE = "virtual:reference-data";
const RESOLVED = `\0${MODULE}`;

const yamlFiles = (dir: string) => readdirSync(dir).filter((f) => f.endsWith(".yaml"));

/** The reference data in `dir`'s YAML files, checked; throws, naming every problem, if there are any. */
export function readReferenceData(dir: string): ReferenceData {
  return loadReferenceData(Object.fromEntries(yamlFiles(dir).map((f) => [f, readFileSync(join(dir, f), "utf8")])));
}

export function referenceData(dir: string): Plugin {
  return {
    name: "awt-reference-data",
    resolveId(id) {
      return id === MODULE ? RESOLVED : undefined;
    },
    load(id) {
      if (id !== RESOLVED) return undefined;
      for (const file of yamlFiles(dir)) this.addWatchFile(join(dir, file));
      return `export default ${JSON.stringify(readReferenceData(dir))};`;
    },
  };
}
