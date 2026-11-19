// HTTP routes, mounted at /api/projects.
import type { Routes } from "@grid/core";
import * as svc from "./service";
import * as storage from "./storage";
import { createProjectSchema, deleteSchema, statusSchema, updateProjectSchema } from "./validation";

export const routes: Routes = {
  "GET /search": { permission: "projects.view", handler: (ctx, request) => svc.search(ctx, request.query.get("q") ?? "") },
  // The Jobs table (/jobs) and a job's Storage section (docs/stage-2-projects.md "Job storage").
  "GET /table": { permission: "projects.view", handler: (ctx) => storage.jobsTable(ctx) },
  "GET /mine": { permission: "projects.view", handler: (ctx) => svc.myActiveJobs(ctx) },
  // Deleting a job: archived only, typed confirmation, Recently deleted first (delete.ts).
  "GET /deleted": { permission: "projects.delete", handler: async (ctx) => (await import("./delete")).deletedProjects(ctx) },
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
  "POST /:projectId/archive": { permission: "projects.complete", handler: (ctx, request) => svc.archiveProject(ctx, request.params.projectId!) },
  "POST /:projectId/restore": { permission: "projects.complete", handler: (ctx, request) => svc.restoreProject(ctx, request.params.projectId!) },
  "POST /:projectId/delete": {
    permission: "projects.delete",
    handler: async (ctx, request) => (await import("./delete")).deleteProject(ctx, request.params.projectId!, deleteSchema.parse(request.body).confirm),
  },
  "POST /:projectId/undelete": { permission: "projects.delete", handler: async (ctx, request) => (await import("./delete")).undeleteProject(ctx, request.params.projectId!) },
  "GET /:projectId/storage": { permission: "projects.complete", handler: (ctx, request) => storage.jobStorage(ctx, request.params.projectId!) },
  "GET /:projectId/code": { permission: "projects.view", handler: (ctx, request) => svc.projectRouteCode(ctx, request.params.projectId!) },
};
