// The pictures a category can have (docs/assets-block.md "What part 4b
// built"): shown on an asset's square when it has no photo, on the
// category's colour, like Docket's category tiles. Keys only, so the
// server and presets can use them; ui/CategoryTile.tsx draws them.

export const CATEGORY_ICONS = [
  { key: "drill", label: "Power tool" },
  { key: "hammer", label: "Hand tool" },
  { key: "wrench", label: "Spanner" },
  { key: "construction", label: "Ladder or barrier" },
  { key: "forklift", label: "Access equipment" },
  { key: "anchor", label: "Height safety" },
  { key: "plug", label: "Lead or RCD" },
  { key: "cable", label: "Cable" },
  { key: "zap", label: "Electrical" },
  { key: "gauge", label: "Test equipment" },
  { key: "thermometer", label: "Meter" },
  { key: "battery-charging", label: "Battery or charger" },
  { key: "fuel", label: "Generator or compressor" },
  { key: "snowflake", label: "Refrigeration" },
  { key: "droplets", label: "Plumbing" },
  { key: "flame", label: "Gas or heating" },
  { key: "camera", label: "Camera" },
  { key: "laptop", label: "Laptop" },
  { key: "lock", label: "Lockbox" },
  { key: "hard-hat", label: "PPE" },
  { key: "ruler", label: "Measuring" },
  { key: "paint-roller", label: "Painting" },
  { key: "shovel", label: "Digging" },
  { key: "traffic-cone", label: "Site safety" },
  { key: "truck", label: "Vehicle" },
  { key: "container", label: "Container or trailer" },
  { key: "package", label: "Other" },
] as const;

export type CategoryIconKey = (typeof CATEGORY_ICONS)[number]["key"];

/** A guess from the name, for a category made without picking one. */
export function guessIcon(name: string): CategoryIconKey {
  const text = name.toLowerCase();
  const rules: [RegExp, CategoryIconKey][] = [
    [/power|drill|saw|grinder|nail gun/, "drill"],
    [/hand tool/, "hammer"],
    [/ladder/, "construction"],
    [/access|scissor|ewp|lift/, "forklift"],
    [/harness|height|fall/, "anchor"],
    [/lead|rcd|extension/, "plug"],
    [/test|meter|tester/, "gauge"],
    [/battery|charger/, "battery-charging"],
    [/generator|compressor/, "fuel"],
    [/refrigeration|aircon|hvac/, "snowflake"],
    [/plumb|drain|jetter|press|thread/, "droplets"],
    [/gas|heat/, "flame"],
    [/camera/, "camera"],
    [/laptop|computer|programmer/, "laptop"],
    [/lock/, "lock"],
    [/ppe|first aid|safety gear/, "hard-hat"],
    [/vehicle|van|ute|truck/, "truck"],
    [/trailer|container|bin/, "container"],
  ];
  return rules.find(([pattern]) => pattern.test(text))?.[1] ?? "package";
}
