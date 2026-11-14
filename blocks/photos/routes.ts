// HTTP routes, mounted at /api/photos.
import type { Routes } from "@grid/core";
import * as svc from "./service";
import { addNoteSchema, addPhotoSchema, deleteNowSchema, feedQuery, photoNoteSchema, pinsQuery, restoreSchema, updateNoteSchema, updatePhotoSchema } from "./validation";

export const routes: Routes = {
  // Recently deleted (Settings › Storage): managers only.
  "GET /deleted": { permission: "photos.manage", handler: (ctx) => svc.listDeleted(ctx) },
  "POST /deleted/restore": {
    permission: "photos.manage",
    handler: (ctx, request) => {
      const body = restoreSchema.parse(request.body);
      return svc.restore(ctx, body.kind, body.id);
    },
  },
  "POST /deleted/delete-now": { permission: "photos.manage", handler: (ctx, request) => svc.deleteNow(ctx, deleteNowSchema.parse(request.body)) },
  "GET /jobs/:projectId": {
    permission: "photos.view",
    handler: (ctx, request) => {
      const query = feedQuery.parse(Object.fromEntries(request.query));
      return svc.feed(ctx, request.params.projectId!, { buildingId: query.building, levelId: query.level, tag: query.tag });
    },
  },
  // Photo pins on a plan sheet: /api/photos/pins/<sheetId>?job=<projectId>
  "GET /pins/:sheetId": {
    permission: "photos.view",
    handler: (ctx, request) => svc.pinsForSheet(ctx, pinsQuery.parse(Object.fromEntries(request.query)).job, request.params.sheetId!),
  },
  "POST /": { permission: "photos.add", handler: (ctx, request) => svc.addPhoto(ctx, addPhotoSchema.parse(request.body)) },
  "PATCH /:id": { permission: "photos.add", handler: (ctx, request) => svc.updatePhoto(ctx, request.params.id!, updatePhotoSchema.parse(request.body)) },
  "DELETE /:id": { permission: "photos.add", handler: (ctx, request) => svc.deletePhoto(ctx, request.params.id!) },
  "POST /notes": { permission: "photos.add", handler: (ctx, request) => svc.addNote(ctx, addNoteSchema.parse(request.body)) },
  "PATCH /notes/:id": {
    permission: "photos.add",
    handler: (ctx, request) => svc.updateNote(ctx, request.params.id!, updateNoteSchema.parse(request.body).body),
  },
  "DELETE /notes/:id": { permission: "photos.add", handler: (ctx, request) => svc.deleteNote(ctx, request.params.id!) },

  // Notes on one photo (a dated list). Each call returns the photo's notes.
  "GET /:id/notes": { permission: "photos.view", handler: (ctx, request) => svc.photoNotes(ctx, request.params.id!) },
  "POST /:id/notes": { permission: "photos.add", handler: (ctx, request) => svc.addPhotoNote(ctx, request.params.id!, photoNoteSchema.parse(request.body).body) },
  "PATCH /photo-notes/:noteId": {
    permission: "photos.add",
    handler: (ctx, request) => svc.updatePhotoNote(ctx, request.params.noteId!, photoNoteSchema.parse(request.body).body),
  },
  "DELETE /photo-notes/:noteId": { permission: "photos.add", handler: (ctx, request) => svc.deletePhotoNote(ctx, request.params.noteId!) },
};
