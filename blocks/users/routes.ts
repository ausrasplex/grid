// HTTP routes, mounted at /api/users by the app.
import type { Routes } from "@grid/core";
import { getUser, updateProfile } from "./service";
import { updateProfileSchema } from "./validation";

export const routes: Routes = {
  "GET /me": {
    requireCompany: false,
    handler: (ctx) => getUser(ctx.userId),
  },
  "PATCH /me": {
    requireCompany: false,
    handler: (ctx, request) => updateProfile(ctx.userId, updateProfileSchema.parse(request.body)),
  },
};
