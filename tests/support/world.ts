// A test world for the data layer (TF-2): one in-memory database, a fake
// clock, the test reference data, and a store for each made-up user.
//
//   const w = world();
//   const bram = w.as("bram");          // Bram's store
//   await seedProfile(bram, "bram");
//   const aldric = await seedCharacter(bram, "aldric");

import type { AppSettings, InventoryStore } from "../../src/data/store";
import { MemoryDatabase, createMemoryStore } from "../../src/data/memory-store";
import type { Character, Entry, Grant, ReferenceData } from "../../src/rules/types";
import type { NewEntry } from "../../src/data/types";
import { FakeClock } from "./fake-clock";
import { fixtureCharacter, fixtureUser, testReferenceData } from "./fixtures";

export interface World {
  clock: FakeClock;
  ref: ReferenceData;
  /** The store for a fixture user ("bram", "cass"), or for nobody signed in (null). */
  as(user: string | null): InventoryStore;
  /** A store acting for whoever `auth` says is signed in, as the app's is. */
  forAuth(auth: { currentUser(): { uid: string } | null }): InventoryStore;
}

export function world(settings: Partial<AppSettings> = {}): World {
  const db = new MemoryDatabase();
  const clock = new FakeClock();
  const ref = testReferenceData();
  const full: AppSettings = { showSkillText: false, appVersion: "0.1.0-test", ...settings };
  return {
    clock,
    ref,
    as(user) {
      const uid = user === null ? null : fixtureUser(user).uid;
      return createMemoryStore(db, { currentUid: () => uid, clock, ref, settings: full });
    },
    forAuth(auth) {
      return createMemoryStore(db, { currentUid: () => auth.currentUser()?.uid ?? null, clock, ref, settings: full });
    },
  };
}

export async function seedProfile(store: InventoryStore, user: string): Promise<void> {
  const u = fixtureUser(user);
  await store.createProfile({ displayName: u.displayName, email: u.email });
}

export interface Seeded {
  character: Character;
  /** Fixture entry ID → the entry the store created. */
  entries: Map<string, Entry>;
}

/**
 * Creates a fixture character, with its entries and titles, through the store.
 * By default only M2 features are used: no grants, nothing equipped. With
 * `full`, grants are kept and entries equipped as the fixture says (M4).
 */
export async function seedCharacter(
  store: InventoryStore,
  id: string,
  options: { full?: boolean } = {},
): Promise<Seeded> {
  const input = fixtureCharacter(id);
  const character = await store.createCharacter({
    name: input.character.name,
    className: input.character.className,
    level: input.character.level,
    ...(input.character.notes ? { notes: input.character.notes } : {}),
  });
  const entries = new Map<string, Entry>();
  for (const raw of input.entries ?? []) {
    const {
      id: fixtureId,
      grants,
      ...rest
    } = raw as { id: string; grants?: Grant[]; category: string } & Record<string, unknown>;
    if (rest.category === "skills") {
      const skill = rest as unknown as { skillId: string; howGained: never; levelGained: number };
      const added = await store.addSkill(character.id, {
        skillId: skill.skillId,
        howGained: skill.howGained,
        levelGained: skill.levelGained,
      });
      entries.set(fixtureId, added.entry);
      continue;
    }
    const entry: Record<string, unknown> = {
      ...rest,
      ...(options.full && grants ? { grants: grants.map(({ id: _, ...g }) => g) } : {}),
    };
    entries.set(fixtureId, await store.addEntry(character.id, entry as unknown as NewEntry));
  }
  // The fixture's titles, once per user: a player-level title shared by two
  // fixture characters is added only by the first.
  const existing = new Set((await store.listTitles()).map((t) => t.name));
  for (const title of input.titles ?? []) {
    if (title.scope.level === "player" && existing.has(title.name)) continue;
    await store.addTitle({
      name: title.name,
      ...(title.description ? { description: title.description } : {}),
      ...(title.earned ? { earned: title.earned } : {}),
      scope: title.scope.level === "player" ? title.scope : { level: "character", characterId: character.id },
      ...(options.full && title.grants ? { grants: title.grants.map(({ id: _, ...g }) => g) } : {}),
    });
  }
  if (options.full) {
    for (const q of input.equipped ?? []) await store.equip(entries.get(q.entryId)!.id, q.slot);
  }
  return { character, entries };
}
