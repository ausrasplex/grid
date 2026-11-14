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
  type SiteNoteView,
  type LevelDeletedEvent,
  type SiteListRow,
  type SitesTab,
} from "./service";
export { addressKey, siteNameFromAddress, levelShortName, levelLabel, standardLevels, LEVEL_USES } from "./address";

/** Event payloads. */
export interface BuildingConvertedEvent {
  buildingId: string;
  groundLevelId: string;
}
