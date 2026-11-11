// The rules core (TF-2): pure functions with no database, network or screens.
// M1 fixes their signatures; each throws until its milestone implements it.

import { NotImplementedError } from "../errors";
import type {
  CharacterSheet,
  EquipCheck,
  Id,
  MissingSkillLevel,
  OverLimitAlert,
  ReferenceData,
  SheetChange,
  SlotState,
  SlotTarget,
  Totals,
} from "./types";

export * from "./types";
export { skillPicker, skillWarnings } from "./skills";

/** Class bonus, CM, mitigation, hearts, dice, permissions and effects (GR-1 to GR-12, EQ-9, GR-6). */
export function computeTotals(_sheet: CharacterSheet, _ref: ReferenceData): Totals {
  throw NotImplementedError.stub("computeTotals", "M4");
}

/** Every slot kind, the arcane slots and the rarity allowances, with what's in them (EQ-1, EQ-5 to EQ-7, EQ-10). */
export function slotState(_sheet: CharacterSheet, _ref: ReferenceData): SlotState {
  throw NotImplementedError.stub("slotState", "M4");
}

/** Whether `entryId` may be equipped in `target`: blocked, or allowed with any warnings (EQ-2 to EQ-11). */
export function checkEquip(_sheet: CharacterSheet, _ref: ReferenceData, _entryId: Id, _target: SlotTarget): EquipCheck {
  throw NotImplementedError.stub("checkEquip", "M4");
}

/**
 * Slot kinds, arcane slots and rarities with more equipped than allowed (EQ-8).
 * Given the `change` that led here, each alert names the grant that was lost.
 */
export function overLimitAlerts(_sheet: CharacterSheet, _ref: ReferenceData, _change?: SheetChange): OverLimitAlert[] {
  throw NotImplementedError.stub("overLimitAlerts", "M4");
}

/** Levels where the chart gives a skill but none has that Level gained (SK-6). */
export function recordCheck(_sheet: CharacterSheet, _ref: ReferenceData): MissingSkillLevel[] {
  throw NotImplementedError.stub("recordCheck", "M4");
}
