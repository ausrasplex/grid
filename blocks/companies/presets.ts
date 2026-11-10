// Starting configuration per trade. Block ids that aren't built yet are
// simply skipped, so presets can list future blocks now.
// Companies can change everything afterwards.

export const TRADE_PROFILES = [
  "BUILDER",
  "ELECTRICAL",
  "MECHANICAL",
  "CONTROLS_BMS",
  "PLUMBING",
  "FIRE",
  "CARPENTRY",
  "OTHER",
] as const;
export type TradeProfileId = (typeof TRADE_PROFILES)[number];

const everyone = ["projects", "plans", "markups", "photos", "tasks", "notifications", "swms"];

export const TRADE_PRESETS: Record<TradeProfileId, { blocks: string[]; features: Record<string, boolean> }> = {
  BUILDER: {
    blocks: [...everyone, "rfis", "revisions", "variations", "forms", "measure", "reports"],
    features: { measureArea: true },
  },
  ELECTRICAL: {
    blocks: [...everyone, "rfis", "revisions", "variations", "measure"],
    features: { measureArea: false }, // lengths and counts only
  },
  MECHANICAL: { blocks: [...everyone, "rfis", "revisions", "variations", "measure"], features: { measureArea: true } },
  CONTROLS_BMS: { blocks: [...everyone, "rfis", "revisions", "variations"], features: { measureArea: false } },
  PLUMBING: { blocks: [...everyone, "rfis", "variations", "measure"], features: { measureArea: false } },
  FIRE: { blocks: [...everyone, "rfis", "variations", "measure"], features: { measureArea: false } },
  CARPENTRY: { blocks: [...everyone, "variations", "measure"], features: { measureArea: true } },
  OTHER: { blocks: everyone, features: {} },
};

// ---------------------------------------------------------------------
// Business size (docs/roadmap.md, Phase 1: Solo preset)
// ---------------------------------------------------------------------

export const BUSINESS_SIZES = ["solo", "team"] as const;
export type BusinessSize = (typeof BUSINESS_SIZES)[number];

/** What a sole trader needs day to day. */
export const SOLO_BLOCKS = ["sites", "projects", "photos", "quotes", "templates", "plans", "markups", "documents", "assets"];

/** Blocks that only make sense with other people. One switch away in the Store. */
export const TEAM_BLOCKS = ["rfis", "revisions", "variations", "swms", "forms", "inductions"];

/**
 * Starting Blocks for a new company: the trade preset, adjusted for size.
 * Solo adds the sole-trader set and leaves the team Blocks off.
 */
export function startingBlocks(trade: TradeProfileId, size: BusinessSize): string[] {
  const base = TRADE_PRESETS[trade].blocks;
  if (size === "team") return [...base];
  return [...new Set([...base, ...SOLO_BLOCKS])].filter((id) => !TEAM_BLOCKS.includes(id));
}
