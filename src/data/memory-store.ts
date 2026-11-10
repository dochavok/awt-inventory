// The in-memory data layer (TF-2): one MemoryDatabase holds every user's data,
// and createMemoryStore() gives the store for whoever is signed in, so tests
// can check one user is refused another's records. M1 stub: every method
// throws until its milestone implements it.

import { NotImplementedError } from "../errors";
import type { InventoryStore, StoreContext } from "./store";

/** Every user's data, shared by the stores created over it. */
export class MemoryDatabase {}

const MILESTONE: Record<keyof InventoryStore, string> = {
  createProfile: "M2",
  profile: "M2",
  setDisplayName: "M2",
  deleteAccount: "M2",
  createCharacter: "M2",
  updateCharacter: "M2",
  classCorrectionNotice: "M2",
  correctClass: "M2",
  retireCharacter: "M2",
  restoreCharacter: "M2",
  deleteCharacter: "M2",
  listCharacters: "M2",
  character: "M2",
  addTitle: "M2",
  updateTitle: "M2",
  setTitleScope: "M2",
  removeTitle: "M2",
  listTitles: "M2",
  titlesFor: "M2",
  charactersFor: "M2",
  addEntry: "M2",
  updateEntry: "M2",
  entry: "M2",
  listEntries: "M2",
  markUsed: "M2",
  restoreUsed: "M2",
  markTraded: "M2",
  deleteEntry: "M2",
  suggestions: "M2",
  skillPicker: "M2",
  addSkill: "M2",
  skills: "M2",
  skillReplacements: "M5",
  acceptReplacement: "M5",
  addGrant: "M4",
  addManualGrant: "M4",
  removeGrant: "M4",
  equip: "M4",
  unequip: "M4",
  setActive: "M2",
  totals: "M4",
  alerts: "M4",
  sheet: "M2",
  lastChange: "M4",
  history: "M2",
  search: "M3",
  printableSheet: "M3",
  printablePdf: "M3",
  exportJson: "M3",
  sendReport: "M3",
  reports: "M3",
  syncStatus: "M3",
};

export function createMemoryStore(_db: MemoryDatabase, _context: StoreContext): InventoryStore {
  const store = {} as Record<string, () => Promise<never>>;
  for (const [method, milestone] of Object.entries(MILESTONE)) {
    store[method] = () => Promise.reject(new NotImplementedError(`MemoryStore.${method}`, milestone));
  }
  return store as unknown as InventoryStore;
}
