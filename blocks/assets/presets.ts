// Starting categories per trade (docs/assets-block.md §1): offered on the
// categories page while a business has none, never added by themselves.
// Plain data, so the page and the tests can use it.

export type FieldType = "text" | "number" | "date" | "yesno";

export interface CategoryField {
  key: string;
  label: string;
  type: FieldType;
}

export interface PresetCategory {
  name: string;
  fields: CategoryField[];
}

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

const POWER_TOOLS = { name: "Power tools", fields: [field("Battery platform")] };
const HAND_TOOLS = { name: "Hand tools", fields: [] };
const LADDERS = { name: "Ladders", fields: [field("Type"), field("Height (m)", "number"), field("Rated load (kg)", "number")] };
const LEADS = { name: "Leads & RCDs", fields: [field("Length (m)", "number")] };
const TEST_GEAR = { name: "Test equipment", fields: [] };
const LOCKBOXES = { name: "Lockboxes", fields: [field("Code holder")] };
const HEIGHTS = { name: "Harnesses & height safety", fields: [] };
const ACCESS = { name: "Access equipment", fields: [field("Type")] };
const GENERATORS = { name: "Generators & compressors", fields: [field("Fuel")] };
const PPE = { name: "PPE & first aid", fields: [] };

/** Keyed by the trade's preset (blocks/companies/trades.ts). */
const BY_PRESET: Record<string, PresetCategory[]> = {
  ELECTRICAL: [POWER_TOOLS, TEST_GEAR, LEADS, LADDERS, LOCKBOXES, HAND_TOOLS],
  CONTROLS_BMS: [TEST_GEAR, POWER_TOOLS, { name: "Laptops & programmers", fields: [] }, LADDERS, LEADS],
  MECHANICAL: [POWER_TOOLS, { name: "Refrigeration gear", fields: [] }, TEST_GEAR, LADDERS, ACCESS, LEADS],
  PLUMBING: [POWER_TOOLS, { name: "Drain cameras & jetters", fields: [] }, { name: "Pressing & threading", fields: [] }, LADDERS, LEADS, TEST_GEAR],
  FIRE: [POWER_TOOLS, TEST_GEAR, LADDERS, ACCESS, HEIGHTS, LEADS],
  CARPENTRY: [POWER_TOOLS, HAND_TOOLS, LADDERS, LEADS, { name: "Nail guns & compressors", fields: [] }],
  BUILDER: [POWER_TOOLS, LADDERS, ACCESS, HEIGHTS, GENERATORS, LEADS, PPE],
  OTHER: [POWER_TOOLS, HAND_TOOLS, LADDERS, LEADS],
};

export function presetCategories(preset: string): PresetCategory[] {
  return BY_PRESET[preset] ?? BY_PRESET.OTHER!;
}
