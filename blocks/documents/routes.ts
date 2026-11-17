// HTTP routes, mounted at /api/documents.
import type { Routes } from "@grid/core";
import * as svc from "./service";
import {
  addDocumentsSchema,
  currentSchema,
  deleteNowSchema,
  folderSchema,
  librarySchema,
  linkFolderSchema,
  linkSchema,
  newVersionSchema,
  settingsSchema,
  updateDocumentSchema,
  versionNoteSchema,
} from "./validation";

export const routes: Routes = {
  // Libraries and settings
  "GET /libraries": { permission: "documents.view", handler: (ctx) => svc.listLibraries(ctx) },
  "POST /libraries": { permission: "documents.libraries.manage", handler: (ctx, request) => svc.saveLibrary(ctx, null, librarySchema.parse(request.body)) },
  "PUT /libraries/:id": { permission: "documents.libraries.manage", handler: (ctx, request) => svc.saveLibrary(ctx, request.params.id!, librarySchema.parse(request.body)) },
  "DELETE /libraries/:id": { permission: "documents.libraries.manage", handler: (ctx, request) => svc.deleteLibrary(ctx, request.params.id!) },
  "GET /settings": { permission: "documents.view", handler: (ctx) => svc.getSettings(ctx) },
  "PUT /settings": { permission: "documents.libraries.manage", handler: (ctx, request) => svc.updateSettings(ctx, settingsSchema.parse(request.body)) },

  // Lists
  "GET /library": { permission: "documents.view", handler: (ctx) => svc.listLibraryDocuments(ctx, null) },
  "GET /library/:id": { permission: "documents.view", handler: (ctx, request) => svc.listLibraryDocuments(ctx, request.params.id!) },
  "GET /job/:projectId": { permission: "documents.view", handler: (ctx, request) => svc.jobDocuments(ctx, request.params.projectId!) },
  "POST /job/:projectId/folders": { permission: "documents.edit", handler: (ctx, request) => svc.addFolder(ctx, request.params.projectId!, folderSchema.parse(request.body).name) },
  "PUT /folders/:id": { permission: "documents.edit", handler: (ctx, request) => svc.renameFolder(ctx, request.params.id!, folderSchema.parse(request.body).name) },
  "DELETE /folders/:id": { permission: "documents.edit", handler: (ctx, request) => svc.deleteFolder(ctx, request.params.id!) },

  // Adding
  "POST /add": { permission: "documents.upload", handler: (ctx, request) => svc.addDocuments(ctx, addDocumentsSchema.parse(request.body)) },

  // One document
  "GET /doc/:id": { permission: "documents.view", handler: (ctx, request) => svc.getDocument(ctx, request.params.id!) },
  "PATCH /doc/:id": { permission: "documents.edit", handler: (ctx, request) => svc.updateDocument(ctx, request.params.id!, updateDocumentSchema.parse(request.body)) },
  "POST /doc/:id/versions": { permission: "documents.upload", handler: (ctx, request) => svc.addVersion(ctx, request.params.id!, newVersionSchema.parse(request.body)) },
  "POST /doc/:id/current": { permission: "documents.edit", handler: (ctx, request) => svc.setCurrentVersion(ctx, request.params.id!, currentSchema.parse(request.body).versionId) },
  "DELETE /doc/:id": { permission: "documents.delete", handler: (ctx, request) => svc.deleteDocument(ctx, request.params.id!) },
  "POST /doc/:id/restore": { permission: "documents.delete", handler: (ctx, request) => svc.restoreDocument(ctx, request.params.id!) },
  "POST /doc/:id/links": { permission: "documents.edit", handler: (ctx, request) => svc.linkToJob(ctx, request.params.id!, linkSchema.parse(request.body)) },

  "GET /version/:id": { permission: "documents.view", handler: (ctx, request) => svc.versionStatus(ctx, request.params.id!) },
  "PATCH /version/:id": { permission: "documents.edit", handler: (ctx, request) => svc.updateVersionNote(ctx, request.params.id!, versionNoteSchema.parse(request.body).note) },
  "DELETE /version/:id": { permission: "documents.edit", handler: (ctx, request) => svc.deleteVersion(ctx, request.params.id!) },
  "POST /version/:id/retry": { permission: "documents.upload", handler: (ctx, request) => svc.retryRender(ctx, request.params.id!) },

  // Pinning library documents to jobs
  "GET /pin-jobs": { permission: "documents.edit", handler: (ctx) => svc.jobsToPinTo(ctx) },
  "PATCH /links/:id": { permission: "documents.edit", handler: (ctx, request) => svc.moveLink(ctx, request.params.id!, linkFolderSchema.parse(request.body).folderId) },
  "DELETE /links/:id": { permission: "documents.edit", handler: (ctx, request) => svc.unlink(ctx, request.params.id!) },

  // Recently deleted
  "GET /deleted": { permission: "documents.delete", handler: (ctx) => svc.listDeleted(ctx) },
  "POST /deleted/delete-now": { permission: "documents.delete", handler: (ctx, request) => svc.deleteNow(ctx, deleteNowSchema.parse(request.body).ids) },

  // Rendered pages for the viewer
  "GET /pages/:versionId/:name": { permission: "documents.view", handler: (ctx, request) => svc.pageResponse(ctx, request.params.versionId!, request.params.name!) },
};
