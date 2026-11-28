// The phone calendar feed, for calendars that aren't signed in
// (docs/scheduling-block.md "Phone calendar"). Mounted at
// /api/public/scheduling; the token in the file name is the only key.

import "server-only";
import type { PublicRoutes } from "@grid/core";
import { feedFile } from "./feed";

export const publicRoutes: PublicRoutes = {
  "GET /feed/:file": { handler: async (request) => feedFile(request.params.file!) },
};
