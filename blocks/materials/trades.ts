// The trades a material belongs to (docs/materials-block.md §1): the same
// trades as the plan icons (blocks/markups/icons.ts), plus Other. The trade
// decides a material's section on the handover sheet. Pure, so the browser
// and tests can use it.

export interface MaterialTrade {
  id: string;
  name: string;
}

export const MATERIAL_TRADES: MaterialTrade[] = [
  { id: "electrical", name: "Electrical" },
  { id: "data", name: "Data & comms" },
  { id: "plumbing", name: "Plumbing" },
  { id: "hvac", name: "HVAC" },
  { id: "fire", name: "Fire" },
  { id: "security", name: "Security" },
  { id: "gas", name: "Gas" },
  { id: "solar", name: "Solar & batteries" },
  { id: "other", name: "Other" },
];

export const TRADE_IDS = MATERIAL_TRADES.map((trade) => trade.id);

export const tradeName = (id: string) => MATERIAL_TRADES.find((trade) => trade.id === id)?.name ?? "Other";

/**
 * A business's own trade (Company.tradeProfile, blocks/companies/trades.ts)
 * as a material trade: the starting trade for its new materials.
 * The same table is in the migration that moved the price book onto materials.
 */
const FROM_COMPANY: Record<string, string> = {
  ELECTRICAL: "electrical",
  AV: "electrical",
  LINES: "electrical",
  TEST_TAG: "electrical",
  CONTROLS_BMS: "electrical",
  LIFTS: "electrical",
  DATA_COMMS: "data",
  SOLAR: "solar",
  SECURITY: "security",
  FIRE: "fire",
  FIRE_DETECTION: "fire",
  PASSIVE_FIRE: "fire",
  MECHANICAL: "hvac",
  REFRIGERATION: "hvac",
  DUCTWORK: "hvac",
  INSULATION_LAGGING: "hvac",
  PLUMBING: "plumbing",
  DRAINAGE: "plumbing",
  IRRIGATION: "plumbing",
  GASFITTING: "gas",
};

export const tradeForCompany = (tradeProfile: string | null | undefined) => FROM_COMPANY[tradeProfile ?? ""] ?? "other";
