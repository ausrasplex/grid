// HTTP routes, mounted at /api/sites.
import type { Routes } from "@grid/core";
import * as svc from "./service";
import {
  addBuildingSchema,
  addLevelsSchema,
  createSiteSchema,
  listSitesQuery,
  levelsUseSchema,
  moveLevelSchema,
  renameSchema,
  siteNoteOrderSchema,
  siteNoteSchema,
  updateLevelSchema,
  updateSiteSchema,
} from "./validation";

export const routes: Routes = {
  "GET /": {
    permission: "sites.view",
    handler: (ctx, request) => svc.listSites(ctx, listSitesQuery.parse(Object.fromEntries(request.query))),
  },
  "POST /": { permission: "sites.create", handler: (ctx, request) => svc.createManagedSite(ctx, createSiteSchema.parse(request.body)) },
  "GET /:siteId": { permission: "sites.view", handler: (ctx, request) => svc.getSite(ctx, request.params.siteId!) },
  "PATCH /:siteId": {
    permission: "sites.structure.edit", // and the site must be yours (checked in the service)
    handler: (ctx, request) => svc.updateSite(ctx, request.params.siteId!, updateSiteSchema.parse(request.body)),
  },

  // Site notes (titled: "Security office", "Lockbox"…). Each call returns the site's notes.
  "GET /:siteId/notes": { permission: "sites.view", handler: (ctx, request) => svc.siteNotes(ctx, request.params.siteId!) },
  "POST /:siteId/notes": { permission: "sites.notes.edit", handler: (ctx, request) => svc.addSiteNote(ctx, request.params.siteId!, siteNoteSchema.parse(request.body)) },
  "PUT /:siteId/notes/order": {
    permission: "sites.notes.edit",
    handler: (ctx, request) => svc.orderSiteNotes(ctx, request.params.siteId!, siteNoteOrderSchema.parse(request.body).ids),
  },
  // "Basement 2" → "Parking 2" (P2) for every basement in the building.
  // "Used for" on several floors at once (Car park on Ground to Level 3).
  "POST /buildings/:buildingId/levels/use": {
    permission: "sites.structure.edit",
    handler: (ctx, request) => svc.setLevelsUse(ctx, request.params.buildingId!, levelsUseSchema.parse(request.body)),
  },
  "POST /buildings/:buildingId/parking": { permission: "sites.structure.edit", handler: (ctx, request) => svc.basementsToParking(ctx, request.params.buildingId!) },
  // Deleting a floor: see what's on it first; only an empty one can go.
  "GET /levels/:levelId/usage": { permission: "sites.structure.edit", handler: (ctx, request) => svc.levelUsage(ctx, request.params.levelId!) },
  "DELETE /levels/:levelId": { permission: "sites.structure.edit", handler: (ctx, request) => svc.deleteLevel(ctx, request.params.levelId!) },
  "PATCH /notes/:noteId": { permission: "sites.notes.edit", handler: (ctx, request) => svc.updateSiteNote(ctx, request.params.noteId!, siteNoteSchema.parse(request.body)) },
  "DELETE /notes/:noteId": { permission: "sites.notes.edit", handler: (ctx, request) => svc.deleteSiteNote(ctx, request.params.noteId!) },
  "GET /:siteId/code": { permission: "sites.view", handler: (ctx, request) => svc.siteRouteCode(ctx, request.params.siteId!) },
  "POST /:siteId/buildings": {
    permission: "sites.structure.edit",
    handler: (ctx, request) => svc.addBuilding(ctx, request.params.siteId!, addBuildingSchema.parse(request.body)),
  },
  "PATCH /buildings/:buildingId": {
    permission: "sites.structure.edit",
    handler: (ctx, request) => svc.renameBuilding(ctx, request.params.buildingId!, renameSchema.parse(request.body).name),
  },
  "POST /buildings/:buildingId/convert": {
    permission: "sites.structure.edit",
    handler: (ctx, request) => svc.convertToMultiLevel(ctx, request.params.buildingId!),
  },
  "POST /buildings/:buildingId/levels": {
    permission: "sites.structure.edit",
    handler: (ctx, request) => svc.addLevels(ctx, request.params.buildingId!, addLevelsSchema.parse(request.body)),
  },
  "PATCH /levels/:levelId": {
    permission: "sites.structure.edit",
    handler: (ctx, request) => svc.updateLevel(ctx, request.params.levelId!, updateLevelSchema.parse(request.body)),
  },
  "POST /levels/:levelId/move": {
    permission: "sites.structure.edit",
    handler: (ctx, request) => svc.moveLevel(ctx, request.params.levelId!, moveLevelSchema.parse(request.body).direction),
  },
};
