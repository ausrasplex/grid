// HTTP routes, mounted at /api/projects.
import type { Routes } from "@grid/core";
import * as svc from "./service";
import { createProjectSchema, statusSchema, updateProjectSchema } from "./validation";

export const routes: Routes = {
  "GET /search": { permission: "projects.view", handler: (ctx, request) => svc.search(ctx, request.query.get("q") ?? "") },
  "GET /mine": { permission: "projects.view", handler: (ctx) => svc.myActiveJobs(ctx) },
  "GET /address-check": {
    permission: "projects.create",
    handler: (ctx, request) => svc.checkAddress(ctx, request.query.get("address") ?? ""),
  },
  "GET /at/:siteId": {
    permission: "projects.view",
    handler: (ctx, request) =>
      svc.jobsAt(ctx, { siteId: request.params.siteId!, buildingId: request.query.get("building"), levelId: request.query.get("level") }),
  },
  "POST /": { permission: "projects.create", handler: (ctx, request) => svc.createProject(ctx, createProjectSchema.parse(request.body)) },
  "GET /:projectId": { permission: "projects.view", handler: (ctx, request) => svc.getProject(ctx, request.params.projectId!) },
  "PATCH /:projectId": {
    permission: "projects.edit",
    handler: (ctx, request) => svc.updateProject(ctx, request.params.projectId!, updateProjectSchema.parse(request.body)),
  },
  "POST /:projectId/status": {
    permission: "projects.complete",
    handler: (ctx, request) => svc.setProjectStatus(ctx, request.params.projectId!, statusSchema.parse(request.body).status),
  },
  "GET /:projectId/code": { permission: "projects.view", handler: (ctx, request) => svc.projectRouteCode(ctx, request.params.projectId!) },
};
