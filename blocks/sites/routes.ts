// HTTP routes, mounted at /api/sites.
import { forbidden, type Routes } from "@grid/core";
import * as svc from "./service";
import {
  addBuildingSchema,
  addLevelsSchema,
  createSiteSchema,
  listSitesQuery,
  moveLevelSchema,
  renameSchema,
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
    permission: "sites.view", // name/address need ownership, notes need sites.notes.edit (checked below)
    handler: (ctx, request) => {
      const input = updateSiteSchema.parse(request.body);
      const needs = input.name !== undefined || input.address !== undefined ? "sites.structure.edit" : "sites.notes.edit";
      if (!ctx.permissions.has(needs)) throw forbidden();
      return svc.updateSite(ctx, request.params.siteId!, input);
    },
  },
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
