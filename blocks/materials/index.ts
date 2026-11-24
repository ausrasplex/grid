// Public API for blocks that depend on "materials" (quotes, handover).
export {
  listMaterials,
  getMaterial,
  materialsById,
  materialIdsMatching,
  requireMaterial,
  listBrands,
  type MaterialRow,
  type BrandRow,
  type MaterialChangedEvent,
} from "./service";
export { MATERIAL_TRADES, tradeName, tradeForCompany } from "./trades";
export { priceBookName, materialMeta } from "./words";
