// Starting categories per trade (docs/assets-block.md §1): offered on the
// categories page while a business has none, never added by themselves.
// Plain data, so the page and the tests can use it.

import { guessIcon } from "./category-icons.ts";

export type FieldType = "text" | "number" | "date" | "yesno";

export interface CategoryField {
  key: string;
  label: string;
  type: FieldType;
}

export interface PresetRoutine {
  name: string;
  everyMonths: number;
  mustPass: boolean;
}

export interface PresetCategory {
  name: string;
  /** Its picture (category-icons.ts). */
  icon: string;
  fields: CategoryField[];
  /** Starting routines (§4), changed or removed in the category like any other. */
  routines: PresetRoutine[];
}

/** AS/NZS 3760: every 3 months for gear used on construction and demolition sites. */
const TEST_AND_TAG: PresetRoutine = { name: "Test & tag", everyMonths: 3, mustPass: true };
/** AS/NZS 1891.4: height safety gear inspected by a competent person at least every 6 months. */
const HEIGHTS_CHECK: PresetRoutine = { name: "Height safety inspection", everyMonths: 6, mustPass: true };
const CALIBRATION: PresetRoutine = { name: "Calibration", everyMonths: 12, mustPass: false };

const field = (label: string, type: FieldType = "text"): CategoryField => ({ key: fieldKey(label), label, type });

/** A field's key from its label: "Rated load (kg)" → "rated-load-kg". */
export function fieldKey(label: string) {
  return (
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "field"
  );
}

const preset = (name: string, fields: CategoryField[] = [], routines: PresetRoutine[] = []): PresetCategory => ({ name, icon: guessIcon(name), fields, routines });

const POWER_TOOLS = preset("Power tools", [field("Battery platform")], [TEST_AND_TAG]);
const HAND_TOOLS = preset("Hand tools");
const LADDERS = preset("Ladders", [field("Type"), field("Height (m)", "number"), field("Rated load (kg)", "number")]);
const LEADS = preset("Leads & RCDs", [field("Length (m)", "number")], [TEST_AND_TAG]);
const TEST_GEAR = preset("Test equipment", [], [CALIBRATION]);
const LOCKBOXES = preset("Lockboxes", [field("Code holder")]);
const HEIGHTS = preset("Harnesses & height safety", [], [HEIGHTS_CHECK]);
const ACCESS = preset("Access equipment", [field("Type")]);
const GENERATORS = preset("Generators & compressors", [field("Fuel")], [TEST_AND_TAG]);
const PPE = preset("PPE & first aid");

/** Keyed by the trade's preset (blocks/companies/trades.ts). */
const BY_PRESET: Record<string, PresetCategory[]> = {
  ELECTRICAL: [POWER_TOOLS, TEST_GEAR, LEADS, LADDERS, LOCKBOXES, HAND_TOOLS],
  CONTROLS_BMS: [TEST_GEAR, POWER_TOOLS, preset("Laptops & programmers"), LADDERS, LEADS],
  MECHANICAL: [POWER_TOOLS, preset("Refrigeration gear", [], [TEST_AND_TAG]), TEST_GEAR, LADDERS, ACCESS, LEADS],
  PLUMBING: [POWER_TOOLS, preset("Drain cameras & jetters", [], [TEST_AND_TAG]), preset("Pressing & threading", [], [TEST_AND_TAG]), LADDERS, LEADS, TEST_GEAR],
  FIRE: [POWER_TOOLS, TEST_GEAR, LADDERS, ACCESS, HEIGHTS, LEADS],
  CARPENTRY: [POWER_TOOLS, HAND_TOOLS, LADDERS, LEADS, preset("Nail guns & compressors", [], [TEST_AND_TAG])],
  BUILDER: [POWER_TOOLS, LADDERS, ACCESS, HEIGHTS, GENERATORS, LEADS, PPE],
  OTHER: [POWER_TOOLS, HAND_TOOLS, LADDERS, LEADS],
};

export function presetCategories(preset: string): PresetCategory[] {
  return BY_PRESET[preset] ?? BY_PRESET.OTHER!;
}
