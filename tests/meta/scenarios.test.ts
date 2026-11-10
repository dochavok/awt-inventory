// The rule scenarios' own consistency (TF-9), checked now, before any rules
// code exists: an expected total that doesn't add up, a duplicate ID or a
// reference to a missing fixture would otherwise only show up in M4.

import { expect } from "vitest";
import { fixtureCharacters } from "../support/fixtures";
import { rule } from "../support/rule";
import { allScenarioFiles, loadScenarios, type Scenario } from "../support/scenarios";

const all = (): [string, Scenario][] =>
  allScenarioFiles().flatMap((f) => loadScenarios(f).map((s) => [f, s] as [string, Scenario]));

rule({ req: ["TF-9"], m: "M1" }, "every scenario ID is unique across all scenario files", () => {
  const seen = new Map<string, string>();
  for (const [file, s] of all()) {
    expect(seen.get(s.id), `scenario ${s.id} in ${file}, also in`).toBeUndefined();
    seen.set(s.id, file);
  }
  expect(seen.size, "number of scenarios").toBeGreaterThan(80);
});

rule({ req: ["TF-9"], m: "M1" }, "every expected total equals the sum of its expected lines and grants", () => {
  for (const [file, s] of all()) {
    for (const key of ["cm", "mitigation", "hearts"] as const) {
      const want = s.expect[key];
      if (want?.total === undefined) continue;
      if (want.lines) {
        const sum = Object.values(want.lines).reduce((a, b) => a + (b ?? 0), 0);
        expect(sum, `${file} ${s.id}: ${key} lines vs total ${want.total}`).toBe(want.total);
      }
      if (want.grants) {
        const sum = want.grants.reduce((a, g) => a + (g.amount ?? 0), 0);
        expect(sum, `${file} ${s.id}: ${key} grants vs total ${want.total}`).toBe(want.total);
      }
    }
  }
});

rule({ req: ["TF-9", "TF-3"], m: "M1" }, "every fixture character and entry a scenario names exists", () => {
  const characters = fixtureCharacters();
  for (const [file, s] of all()) {
    const where = `${file} ${s.id}`;
    const base = s.given.character;
    if (base !== undefined) expect(Object.keys(characters), `${where}: its character`).toContain(base);
    const ids = new Set([
      ...((base && characters[base]?.entries) || []).map((e) => e.id as string),
      ...(s.given.sheet?.entries ?? []).map((e) => e.id as string),
      ...(s.given.add?.entries ?? []).map((e) => e.id as string),
    ]);
    const named = [
      ...(s.given.remove?.entries ?? []),
      ...(s.given.remove?.equipped ?? []),
      ...(s.given.add?.equipped ?? []).map((q) => q.entryId),
      ...(s.change?.remove?.entries ?? []),
      ...(s.change?.remove?.equipped ?? []),
      ...(s.equip ? [s.equip.entry] : []),
    ];
    for (const id of named) expect([...ids], `${where}: the entry ${id}`).toContain(id);
  }
});
