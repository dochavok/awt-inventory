// Levels (RD-5): the level cap is the highest level in the chart.

import { CLASS_NAMES, type ReferenceData } from "./types";

/** The highest level in a level chart, across every class. */
export function highestLevel(chart: ReferenceData["levelChart"]): number {
  return Math.max(...CLASS_NAMES.flatMap((c) => chart[c].levels.map((l) => l.level)));
}

/** RD-5: the level cap is the highest level in the chart. */
export function levelCap(ref: ReferenceData): number {
  return highestLevel(ref.levelChart);
}
