// Reference data (section 13): reading and checking the YAML files in data/.
// M1 stub; M2 implements it with zod schemas (RD-4).

import { NotImplementedError } from "../errors";
import type { ReferenceData } from "../rules/types";

/** The reference data files' text, by file name (e.g. "level-chart.yaml"). */
export type ReferenceFiles = Record<string, string>;

export interface DataProblem {
  file: string;
  /** The entry's ID, where the problem is about one. */
  id?: string;
  message: string;
}

/** The files read, checked and turned into reference data. Throws if there are problems. */
export function loadReferenceData(_files: ReferenceFiles): ReferenceData {
  throw new NotImplementedError("loadReferenceData", "M2");
}

/**
 * RD-4: everything wrong with `files`: invalid format, broken references,
 * duplicate IDs or names, gaps in the level chart, and, given the `released`
 * files, any entry that disappeared instead of being retired.
 */
export function validateReferenceData(_files: ReferenceFiles, _released?: ReferenceFiles): DataProblem[] {
  throw new NotImplementedError("validateReferenceData", "M2");
}

/** RD-5: the level cap is the highest level in the chart. */
export function levelCap(_ref: ReferenceData): number {
  throw new NotImplementedError("levelCap", "M2");
}
