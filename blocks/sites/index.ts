// Public API for blocks that depend on "sites" (projects).
export {
  getSite,
  listSites,
  createManagedSite,
  findOrCreatePrivateSite,
  syncCompanySite,
  recordLocation,
  locationOnSite,
  lastLocation,
  siteRouteCode,
  type SiteStructure,
  type SiteListRow,
  type SitesTab,
} from "./service";
export { addressKey, siteNameFromAddress, levelShortName, standardLevels } from "./address";

/** Event payloads. */
export interface BuildingConvertedEvent {
  buildingId: string;
  groundLevelId: string;
}
