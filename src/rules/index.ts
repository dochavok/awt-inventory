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
  SkillPicker,
  SkillWarning,
  SlotState,
  SlotTarget,
  Totals,
} from "./types";

export * from "./types";

/** Class bonus, CM, mitigation, hearts, dice, permissions and effects (GR-1 to GR-12, EQ-9, GR-6). */
export function computeTotals(_sheet: CharacterSheet, _ref: ReferenceData): Totals {
  throw new NotImplementedError("computeTotals", "M4");
}

/** Every slot kind, the arcane slots and the rarity allowances, with what's in them (EQ-1, EQ-5 to EQ-7, EQ-10). */
export function slotState(_sheet: CharacterSheet, _ref: ReferenceData): SlotState {
  throw new NotImplementedError("slotState", "M4");
}

/** Whether `entryId` may be equipped in `target`: blocked, or allowed with any warnings (EQ-2 to EQ-11). */
export function checkEquip(_sheet: CharacterSheet, _ref: ReferenceData, _entryId: Id, _target: SlotTarget): EquipCheck {
  throw new NotImplementedError("checkEquip", "M4");
}

/**
 * Slot kinds, arcane slots and rarities with more equipped than allowed (EQ-8).
 * Given the `change` that led here, each alert names the grant that was lost.
 */
export function overLimitAlerts(_sheet: CharacterSheet, _ref: ReferenceData, _change?: SheetChange): OverLimitAlert[] {
  throw new NotImplementedError("overLimitAlerts", "M4");
}

/** The skill picker's two lists (SK-1, SK-1a). `query` searches by name. */
export function skillPicker(
  _sheet: CharacterSheet,
  _ref: ReferenceData,
  _options: { allTrees: boolean; query?: string },
): SkillPicker {
  throw new NotImplementedError("skillPicker", "M2");
}

/** The warnings for adding `skillId` to the character (SK-3). Empty when nothing is wrong. */
export function skillWarnings(_sheet: CharacterSheet, _ref: ReferenceData, _skillId: Id): SkillWarning[] {
  throw new NotImplementedError("skillWarnings", "M2");
}

/** Levels where the chart gives a skill but none has that Level gained (SK-6). */
export function recordCheck(_sheet: CharacterSheet, _ref: ReferenceData): MissingSkillLevel[] {
  throw new NotImplementedError("recordCheck", "M4");
}
