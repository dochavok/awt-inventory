// The table of results by milestone (TF-5), printed by the Vitest reporter and,
// for each phone, by the browser one, so the two always match.

export const COLUMNS = ["passed", "passed early", "failed as expected", "failed"] as const;

export type Column = (typeof COLUMNS)[number];

export type Counts = Record<Column, number>;

export function emptyCounts(): Counts {
  return { passed: 0, "passed early": 0, "failed as expected": 0, failed: 0 };
}

/** The header and one line per milestone, in milestone order. */
export function milestoneTable(rows: Map<string, Counts>): string[] {
  const line = (first: string, cells: (column: Column) => string | number) =>
    ` ${first.padEnd(9)}${COLUMNS.map((c) => ` ${String(cells(c)).padStart(c.length + 2)}`).join("")}`;
  const lines = [line("Milestone", (c) => c)];
  for (const [milestone, row] of [...rows].sort(([a], [b]) => a.localeCompare(b))) {
    lines.push(line(milestone, (c) => row[c]));
  }
  return lines;
}
