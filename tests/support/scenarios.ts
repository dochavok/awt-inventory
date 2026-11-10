// Rule scenarios (TF-9): YAML files in tests/scenarios/, each a list of
// scenarios with a permanent `id`. runScenarios() turns each one into a tagged
// test that builds the character, runs the rules core, and checks every
// expected value against what it belongs to (TF-8).
//
// A scenario:
//   id: cm-aldric-breakdown          permanent, never reused
//   req: [GR-8]                      requirement IDs
//   q: [Q2]                          DM questions it depends on (optional)
//   milestone: M4
//   title: Aldric's CM is 170, ...   what it shows
//   given:
//     character: aldric              a fixture character, or
//     sheet: { character, entries, equipped, titles, manualGrants }
//     level: 12                      overrides, applied in this order:
//     className: Mage
//     remove: { entries: [ids], equipped: [entry ids], titles: [ids], manualGrants: [ids] }
//     add: { entries: [...], equipped: [...], titles: [...], manualGrants: [...] }
//   change:                          optional: what happens next, for alerts (EQ-8)
//     reason: traded
//     level / className / remove / add, as above
//   equip: { entry: id, slot: target }   optional: the equip to check
//   expect: see Expect below. Every key given is checked; lists are exact.

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect } from "vitest";
import { parse } from "yaml";
import {
  checkEquip,
  computeTotals,
  overLimitAlerts,
  slotState,
  type BreakdownGroup,
  type CharacterSheet,
  type ClassName,
  type Entry,
  type Equipped,
  type LossReason,
  type ManualGrant,
  type SourceRef,
  type Title,
  type Total,
} from "../../src/rules";
import { fixtureSheet, testReferenceData, toSheet, type CharacterInput } from "./fixtures";
import type { Milestone } from "./milestones";
import { rule } from "./rule";

interface SheetEdit {
  level?: number;
  className?: ClassName;
  remove?: { entries?: string[]; equipped?: string[]; titles?: string[]; manualGrants?: string[] };
  add?: {
    entries?: Record<string, unknown>[];
    equipped?: Equipped[];
    titles?: Title[];
    manualGrants?: ManualGrant[];
  };
}

interface GrantExpect {
  source: string;
  amount?: number;
  die?: string;
  condition?: string;
}

interface TotalExpect {
  total?: number;
  lines?: Partial<Record<BreakdownGroup, number>>;
  grants?: GrantExpect[];
  situational?: GrantExpect[];
}

interface Expect {
  classBonus?: { name: string; value: number };
  cm?: TotalExpect;
  mitigation?: TotalExpect;
  hearts?: TotalExpect;
  dice?: { base?: string; extra?: GrantExpect[]; situational?: GrantExpect[] };
  permissions?: string[];
  effects?: { effect: string; text: string; source: string }[];
  slots?: Record<
    string,
    { allowed?: number; equipped?: number; occupants?: string[]; extra?: { label: string; source: string }[] }
  >;
  arcane?: { allowed?: number; used?: number; occupants?: string[] };
  rarities?: Record<string, { allowed?: number | null; equipped?: number }>;
  equip?: {
    outcome: "allowed" | "blocked";
    block?: { reason: string; about: string; occupants?: string[]; mentions?: string[] };
    warnings?: string[];
  };
  alerts?: {
    scope: string;
    equipped: number;
    allowed: number;
    lost?: { source: string; reason: LossReason };
    mentions?: string[];
  }[];
}

export interface Scenario {
  id: string;
  req: string[];
  q?: string[];
  milestone: Milestone;
  title: string;
  given: SheetEdit & { character?: string; sheet?: CharacterInput };
  change?: SheetEdit & { reason: LossReason };
  equip?: { entry: string; slot: string };
  expect: Expect;
}

const SCENARIO_KEYS = new Set(["id", "req", "q", "milestone", "title", "given", "change", "equip", "expect"]);
const EXPECT_KEYS = new Set([
  "classBonus",
  "cm",
  "mitigation",
  "hearts",
  "dice",
  "permissions",
  "effects",
  "slots",
  "arcane",
  "rarities",
  "equip",
  "alerts",
]);

const SCENARIO_DIR = new URL("../scenarios/", import.meta.url);

export function loadScenarios(file: string): Scenario[] {
  const text = readFileSync(fileURLToPath(new URL(file, SCENARIO_DIR)), "utf8");
  const list = parse(text) as Scenario[];
  if (!Array.isArray(list)) throw new Error(`${file}: expected a list of scenarios`);
  for (const s of list) {
    const unknown = Object.keys(s).filter((k) => !SCENARIO_KEYS.has(k));
    const unknownExpect = Object.keys(s.expect ?? {}).filter((k) => !EXPECT_KEYS.has(k));
    if (unknown.length || unknownExpect.length) {
      throw new Error(`${file} scenario ${s.id}: unknown keys ${[...unknown, ...unknownExpect].join(", ")}`);
    }
    if (!s.id || !s.title || !s.expect || Object.keys(s.expect).length === 0) {
      throw new Error(`${file}: every scenario needs an id, a title and something to expect (${s.id ?? "no id"})`);
    }
  }
  return list;
}

export function allScenarioFiles(): string[] {
  return readdirSync(fileURLToPath(SCENARIO_DIR))
    .filter((f) => f.endsWith(".yaml"))
    .sort();
}

function applyEdit(sheet: CharacterSheet, edit: SheetEdit): CharacterSheet {
  const id = sheet.character.id;
  const removed = edit.remove ?? {};
  const added = edit.add ?? {};
  const has = (list: string[] | undefined, value: string) => (list ?? []).includes(value);
  return {
    character: {
      ...sheet.character,
      ...(edit.level !== undefined ? { level: edit.level } : {}),
      ...(edit.className !== undefined ? { className: edit.className } : {}),
    },
    entries: [
      ...sheet.entries.filter((e) => !has(removed.entries, e.id)),
      ...(added.entries ?? []).map((e) => ({ quantity: 1, ...e, characterId: id }) as unknown as Entry),
    ],
    equipped: [
      ...sheet.equipped.filter((q) => !has(removed.equipped, q.entryId) && !has(removed.entries, q.entryId)),
      ...(added.equipped ?? []),
    ],
    titles: [...sheet.titles.filter((t) => !has(removed.titles, t.id)), ...(added.titles ?? [])],
    manualGrants: [
      ...sheet.manualGrants.filter((g) => !has(removed.manualGrants, g.id)),
      ...(added.manualGrants ?? []),
    ],
  };
}

export function scenarioSheet(s: Scenario): CharacterSheet {
  const base = s.given.character
    ? fixtureSheet(s.given.character)
    : s.given.sheet
      ? toSheet(`scenario-${s.id}`, s.given.sheet)
      : undefined;
  if (!base) throw new Error(`scenario ${s.id}: given needs a character or a sheet`);
  return applyEdit(base, s.given);
}

/** The name a scenario uses for a source: entry, skill or title name, manual reason, or "level chart". */
export function sourceName(source: SourceRef): string {
  switch (source.type) {
    case "manual":
      return source.reason;
    case "level-chart":
      return "level chart";
    default:
      return source.name;
  }
}

function grantList(lines: { source: SourceRef; amount?: number; die?: string; condition?: string }[]) {
  return lines
    .map((g) => ({
      source: sourceName(g.source),
      ...(g.amount !== undefined ? { amount: g.amount } : {}),
      ...(g.die !== undefined ? { die: g.die } : {}),
      ...(g.condition !== undefined ? { condition: g.condition } : {}),
    }))
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}

function sorted<T>(list: T[]): T[] {
  return [...list].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}

function checkTotal(who: string, what: string, actual: Total, wanted: TotalExpect): void {
  if (wanted.total !== undefined) expect(actual.value, `${who}'s total ${what}`).toBe(wanted.total);
  if (wanted.lines !== undefined) {
    expect(
      actual.lines.map((l) => [l.group, l.value]),
      `${who}'s ${what} breakdown lines, in order, zero lines hidden`,
    ).toEqual(Object.entries(wanted.lines));
  }
  if (wanted.grants !== undefined) {
    expect(grantList(actual.grants), `every grant in ${who}'s ${what}`).toEqual(sorted(wanted.grants));
  }
  if (wanted.situational !== undefined) {
    expect(grantList(actual.situational), `situational grants listed under ${who}'s ${what}`).toEqual(
      sorted(wanted.situational),
    );
  }
}

function scopeName(scope: { type: string; id?: string }): string {
  return scope.type === "slot-kind" ? scope.id! : scope.type === "arcane" ? "arcane" : `rarity:${scope.id}`;
}

export function checkScenario(s: Scenario): void {
  const ref = testReferenceData();
  const before = scenarioSheet(s);
  const sheet = s.change ? applyEdit(before, s.change) : before;
  const who = sheet.character.name;
  const names = new Map(before.entries.map((e) => [e.id, "name" in e ? e.name : e.skillId]));
  const want = s.expect;

  const needsTotals = ["classBonus", "cm", "mitigation", "hearts", "dice", "permissions", "effects"].some(
    (k) => k in want,
  );
  if (needsTotals) {
    const totals = computeTotals(sheet, ref);
    if (want.classBonus) expect(totals.classBonus, `${who}'s class bonus`).toEqual(want.classBonus);
    if (want.cm) checkTotal(who, "CM", totals.cm, want.cm);
    if (want.mitigation) checkTotal(who, "mitigation", totals.mitigation, want.mitigation);
    if (want.hearts) checkTotal(who, "max hearts", totals.hearts, want.hearts);
    if (want.dice) {
      if (want.dice.base !== undefined) expect(totals.dice.base, `${who}'s level-chart dice`).toBe(want.dice.base);
      if (want.dice.extra !== undefined) {
        expect(grantList(totals.dice.extra), `${who}'s extra dice, each with its source`).toEqual(
          sorted(want.dice.extra),
        );
      }
      if (want.dice.situational !== undefined) {
        expect(grantList(totals.dice.situational), `${who}'s situational dice`).toEqual(sorted(want.dice.situational));
      }
    }
    if (want.permissions) {
      expect(totals.permissions.map((p) => p.permission).sort(), `${who}'s permissions`).toEqual(
        [...want.permissions].sort(),
      );
    }
    if (want.effects) {
      expect(
        sorted(totals.effects.map((e) => ({ effect: e.effect, text: e.text, source: sourceName(e.source) }))),
        `${who}'s resistances, immunities and CR bonuses`,
      ).toEqual(sorted(want.effects));
    }
  }

  if (want.slots || want.arcane || want.rarities) {
    const state = slotState(sheet, ref);
    for (const [kind, w] of Object.entries(want.slots ?? {})) {
      const actual = state.kinds.find((k) => k.kind === kind);
      expect(actual, `${who} has a ${kind} slot kind`).toBeDefined();
      if (w.allowed !== undefined) expect(actual!.allowed, `${who}'s ${kind} slots allowed`).toBe(w.allowed);
      if (w.equipped !== undefined) expect(actual!.equipped, `${who}'s ${kind} slots equipped`).toBe(w.equipped);
      if (w.occupants !== undefined) {
        expect(
          actual!.slots.flatMap((v) => (v.occupant ? [v.occupant.name] : [])).sort(),
          `what's in ${who}'s ${kind} slots`,
        ).toEqual([...w.occupants].sort());
      }
      if (w.extra !== undefined) {
        expect(
          actual!.slots.flatMap((v) => (v.source ? [{ label: v.label, source: sourceName(v.source) }] : [])),
          `${who}'s extra ${kind} slots and where they come from`,
        ).toEqual(w.extra);
      }
    }
    if (want.arcane) {
      if (want.arcane.allowed !== undefined)
        expect(state.arcane.allowed, `${who}'s arcane slots`).toBe(want.arcane.allowed);
      if (want.arcane.used !== undefined)
        expect(state.arcane.used, `${who}'s arcane slots used`).toBe(want.arcane.used);
      if (want.arcane.occupants !== undefined) {
        expect(state.arcane.occupants.map((o) => o.name).sort(), `${who}'s arcane items in use`).toEqual(
          [...want.arcane.occupants].sort(),
        );
      }
    }
    for (const [rarity, w] of Object.entries(want.rarities ?? {})) {
      const actual = state.rarities.find((r) => r.rarity === rarity);
      expect(actual, `${who} has a ${rarity} allowance`).toBeDefined();
      if (w.allowed !== undefined) expect(actual!.allowed, `${who}'s ${rarity} allowance`).toBe(w.allowed);
      if (w.equipped !== undefined) expect(actual!.equipped, `${who}'s ${rarity} items equipped`).toBe(w.equipped);
    }
  }

  if (want.equip) {
    if (!s.equip) throw new Error(`scenario ${s.id}: expect.equip needs an equip`);
    const result = checkEquip(sheet, ref, s.equip.entry, s.equip.slot);
    const what = `equipping ${names.get(s.equip.entry) ?? s.equip.entry} in ${s.equip.slot} on ${who}`;
    expect(result.outcome, what).toBe(want.equip.outcome);
    if (want.equip.block) {
      expect(result.block?.reason, `why ${what} is blocked`).toBe(want.equip.block.reason);
      expect(result.block?.about, `what blocks ${what}`).toBe(want.equip.block.about);
      if (want.equip.block.occupants !== undefined) {
        expect(result.block!.occupants.map((o) => o.name).sort(), `what's in the way of ${what}`).toEqual(
          [...want.equip.block.occupants].sort(),
        );
      }
      for (const text of want.equip.block.mentions ?? []) {
        expect(result.block!.message, `the block message for ${what}`).toContain(text);
      }
    } else {
      expect(result.block, `${what} has no block`).toBeUndefined();
    }
    expect(result.warnings.map((w) => w.permission).sort(), `warnings for ${what}`).toEqual(
      [...(want.equip.warnings ?? [])].sort(),
    );
  }

  if (want.alerts) {
    const alerts = overLimitAlerts(sheet, ref, s.change ? { before, reason: s.change.reason } : undefined);
    expect(
      sorted(alerts.map((a) => ({ scope: scopeName(a.scope), equipped: a.equipped, allowed: a.allowed }))),
      `${who}'s over-limit alerts`,
    ).toEqual(sorted(want.alerts.map((a) => ({ scope: a.scope, equipped: a.equipped, allowed: a.allowed }))));
    for (const w of want.alerts) {
      const alert = alerts.find((a) => scopeName(a.scope) === w.scope)!;
      if (w.lost) {
        expect(
          alert.lost && { source: sourceName(alert.lost.source), reason: alert.lost.reason },
          `the lost grant named by ${who}'s ${w.scope} alert`,
        ).toEqual(w.lost);
      }
      for (const text of w.mentions ?? []) expect(alert.message, `${who}'s ${w.scope} alert message`).toContain(text);
    }
  }
}

/** Declares one tagged test per scenario in `file`. */
export function runScenarios(file: string): void {
  for (const s of loadScenarios(file)) {
    rule({ req: s.req, ...(s.q ? { q: s.q } : {}), m: s.milestone }, `${s.title} (scenario ${s.id})`, () =>
      checkScenario(s),
    );
  }
}
