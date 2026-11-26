// HTTP routes, mounted at /api/themes. Your own themes need no business;
// the business's are checked in the service (themes.business.manage).
import type { Routes } from "@grid/core";
import * as service from "./service";
import { copyThemeSchema, createThemeSchema, importThemeSchema, themeSchema } from "./validation";

export const routes: Routes = {
  "GET /": { requireCompany: false, handler: (ctx) => service.listThemes(ctx) },
  "POST /": { requireCompany: false, handler: (ctx, request) => service.createTheme(ctx, createThemeSchema.parse(request.body)) },
  "POST /import": {
    requireCompany: false,
    handler: (ctx, request) => {
      const { scope, file } = importThemeSchema.parse(request.body);
      return service.importTheme(ctx, scope, file);
    },
  },
  "GET /:id": { requireCompany: false, handler: (ctx, request) => service.getTheme(ctx, request.params.id!) },
  "PUT /:id": { requireCompany: false, handler: (ctx, request) => service.updateTheme(ctx, request.params.id!, themeSchema.parse(request.body)) },
  "DELETE /:id": { requireCompany: false, handler: (ctx, request) => service.deleteTheme(ctx, request.params.id!) },
  "POST /:id/copy": {
    requireCompany: false,
    handler: (ctx, request) => service.copyTheme(ctx, request.params.id!, copyThemeSchema.parse(request.body ?? {}).scope),
  },
  "GET /:id/export": { requireCompany: false, handler: (ctx, request) => service.exportTheme(ctx, request.params.id!) },
};
