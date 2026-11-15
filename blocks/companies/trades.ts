// The trades a business can pick (setup, Settings › Business details).
// Plain data with no server code, so the setup page can import it too
// ("@grid/block-companies/trades").
//
// Each trade borrows a starting preset (presets.ts) from the closest of the
// original eight: which Blocks start on, and whether plans measure areas.
// Ids are stored on Company.tradeProfile: add new ones freely, but never
// rename or remove one that's in use.

export type TradePreset = "BUILDER" | "ELECTRICAL" | "MECHANICAL" | "CONTROLS_BMS" | "PLUMBING" | "FIRE" | "CARPENTRY" | "OTHER";

export interface Trade {
  id: string;
  label: string;
  group: string;
  preset: TradePreset;
}

export const TRADES: readonly Trade[] = [
  // Electrical and communications
  { id: "ELECTRICAL", label: "Electrical", group: "Electrical & communications", preset: "ELECTRICAL" },
  { id: "DATA_COMMS", label: "Data & communications", group: "Electrical & communications", preset: "ELECTRICAL" },
  { id: "SOLAR", label: "Solar & batteries", group: "Electrical & communications", preset: "ELECTRICAL" },
  { id: "SECURITY", label: "Security & access control", group: "Electrical & communications", preset: "ELECTRICAL" },
  { id: "AV", label: "Audio visual", group: "Electrical & communications", preset: "ELECTRICAL" },
  { id: "LINES", label: "Overhead & underground lines", group: "Electrical & communications", preset: "ELECTRICAL" },
  { id: "CONTROLS_BMS", label: "Controls / BMS", group: "Electrical & communications", preset: "CONTROLS_BMS" },
  { id: "LIFTS", label: "Lifts & escalators", group: "Electrical & communications", preset: "CONTROLS_BMS" },
  { id: "TEST_TAG", label: "Test & tag", group: "Electrical & communications", preset: "ELECTRICAL" },

  // Fire
  { id: "FIRE", label: "Fire protection (sprinklers, hydrants)", group: "Fire", preset: "FIRE" },
  { id: "FIRE_DETECTION", label: "Fire detection & alarms", group: "Fire", preset: "FIRE" },
  { id: "PASSIVE_FIRE", label: "Passive fire & penetrations", group: "Fire", preset: "FIRE" },

  // Mechanical and plumbing
  { id: "MECHANICAL", label: "Mechanical / HVAC", group: "Mechanical & plumbing", preset: "MECHANICAL" },
  { id: "REFRIGERATION", label: "Refrigeration", group: "Mechanical & plumbing", preset: "MECHANICAL" },
  { id: "DUCTWORK", label: "Ductwork & sheet metal", group: "Mechanical & plumbing", preset: "MECHANICAL" },
  { id: "INSULATION_LAGGING", label: "Pipe & duct insulation", group: "Mechanical & plumbing", preset: "MECHANICAL" },
  { id: "PLUMBING", label: "Plumbing", group: "Mechanical & plumbing", preset: "PLUMBING" },
  { id: "GASFITTING", label: "Gasfitting", group: "Mechanical & plumbing", preset: "PLUMBING" },
  { id: "DRAINAGE", label: "Drainage", group: "Mechanical & plumbing", preset: "PLUMBING" },
  { id: "IRRIGATION", label: "Irrigation", group: "Mechanical & plumbing", preset: "PLUMBING" },

  // Building
  { id: "BUILDER", label: "Builder", group: "Building", preset: "BUILDER" },
  { id: "PROJECT_MANAGER", label: "Project / site management", group: "Building", preset: "BUILDER" },
  { id: "CARPENTRY", label: "Carpentry", group: "Building", preset: "CARPENTRY" },
  { id: "JOINERY", label: "Joinery & cabinetmaking", group: "Building", preset: "CARPENTRY" },
  { id: "SHOPFITTING", label: "Shopfitting", group: "Building", preset: "CARPENTRY" },
  { id: "PLASTERING", label: "Plastering & ceilings", group: "Building", preset: "CARPENTRY" },
  { id: "PARTITIONS", label: "Partitions & steel framing", group: "Building", preset: "CARPENTRY" },
  { id: "PAINTING", label: "Painting & decorating", group: "Building", preset: "CARPENTRY" },
  { id: "TILING", label: "Tiling", group: "Building", preset: "CARPENTRY" },
  { id: "WATERPROOFING", label: "Waterproofing", group: "Building", preset: "CARPENTRY" },
  { id: "FLOORING", label: "Flooring & carpet", group: "Building", preset: "CARPENTRY" },
  { id: "RENDERING", label: "Rendering", group: "Building", preset: "CARPENTRY" },
  { id: "BRICKLAYING", label: "Bricklaying & blocklaying", group: "Building", preset: "CARPENTRY" },
  { id: "ROOFING", label: "Roofing & guttering", group: "Building", preset: "CARPENTRY" },
  { id: "CLADDING", label: "Cladding & facades", group: "Building", preset: "CARPENTRY" },
  { id: "GLAZING", label: "Glazing & windows", group: "Building", preset: "CARPENTRY" },
  { id: "INSULATION", label: "Insulation", group: "Building", preset: "CARPENTRY" },
  { id: "CAULKING", label: "Caulking & sealants", group: "Building", preset: "CARPENTRY" },
  { id: "SIGNAGE", label: "Signage", group: "Building", preset: "CARPENTRY" },

  // Structure and civil
  { id: "CONCRETING", label: "Concreting", group: "Structure & civil", preset: "CARPENTRY" },
  { id: "FORMWORK", label: "Formwork", group: "Structure & civil", preset: "CARPENTRY" },
  { id: "STEEL_FIXING", label: "Steel fixing", group: "Structure & civil", preset: "CARPENTRY" },
  { id: "STRUCTURAL_STEEL", label: "Structural steel & welding", group: "Structure & civil", preset: "CARPENTRY" },
  { id: "CORE_DRILLING", label: "Concrete cutting & core drilling", group: "Structure & civil", preset: "CARPENTRY" },
  { id: "SCAFFOLDING", label: "Scaffolding", group: "Structure & civil", preset: "OTHER" },
  { id: "RIGGING", label: "Rigging & cranes", group: "Structure & civil", preset: "OTHER" },
  { id: "DEMOLITION", label: "Demolition & strip-out", group: "Structure & civil", preset: "CARPENTRY" },
  { id: "ASBESTOS", label: "Asbestos & hazardous materials", group: "Structure & civil", preset: "OTHER" },
  { id: "EXCAVATION", label: "Excavation & earthmoving", group: "Structure & civil", preset: "CARPENTRY" },
  { id: "CIVIL", label: "Civil works & roads", group: "Structure & civil", preset: "CARPENTRY" },
  { id: "PILING", label: "Piling", group: "Structure & civil", preset: "CARPENTRY" },

  // Outside and finishing
  { id: "LANDSCAPING", label: "Landscaping", group: "Outside & finishing", preset: "CARPENTRY" },
  { id: "FENCING", label: "Fencing & gates", group: "Outside & finishing", preset: "CARPENTRY" },
  { id: "POOLS", label: "Pools & spas", group: "Outside & finishing", preset: "PLUMBING" },
  { id: "CLEANING", label: "Builders cleaning", group: "Outside & finishing", preset: "OTHER" },
  { id: "LINEMARKING", label: "Line marking", group: "Outside & finishing", preset: "CARPENTRY" },

  // Professional and services
  { id: "SURVEYING", label: "Surveying", group: "Professional & services", preset: "BUILDER" },
  { id: "ENGINEERING", label: "Engineering & design", group: "Professional & services", preset: "BUILDER" },
  { id: "CERTIFYING", label: "Building surveying & certification", group: "Professional & services", preset: "BUILDER" },
  { id: "ESTIMATING", label: "Estimating & quantity surveying", group: "Professional & services", preset: "BUILDER" },
  { id: "TRAFFIC", label: "Traffic management", group: "Professional & services", preset: "OTHER" },
  { id: "LABOUR_HIRE", label: "Labour hire", group: "Professional & services", preset: "OTHER" },
  { id: "FACILITY", label: "Facility & property maintenance", group: "Professional & services", preset: "OTHER" },
  { id: "HANDYMAN", label: "Handyman / multi-trade", group: "Professional & services", preset: "CARPENTRY" },

  { id: "OTHER", label: "Something else", group: "Other", preset: "OTHER" },
];

export const TRADE_IDS = TRADES.map((trade) => trade.id) as [string, ...string[]];

/** The trade's name for the screen (falls back to tidying the id). */
export function tradeLabel(id: string): string {
  return TRADES.find((trade) => trade.id === id)?.label ?? id.charAt(0) + id.slice(1).toLowerCase().replace(/_/g, " ");
}

/** The starting preset a trade borrows. */
export function tradePreset(id: string): TradePreset {
  return TRADES.find((trade) => trade.id === id)?.preset ?? "OTHER";
}

/** For a drop-down: grouped options in list order. */
export const tradeOptions = TRADES.map((trade) => ({ value: trade.id, label: trade.label, group: trade.group }));
