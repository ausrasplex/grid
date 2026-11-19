// A shared plan link, for people who aren't signed in (docs/plans-block.md
// "Sharing plans"). Mounted at /api/public/plans; the page is /s/<token>.
// The token is the only key; share.ts checks it on every request (so a
// link that's turned off stops loading straight away), and only the
// sheets and revisions the link shows can be reached.

import "server-only";
import type { PublicRoutes } from "@grid/core";
import { serveTile } from "./service";
import { sharedDrawing, sharedPdf, sharedTileVersion } from "./share";

/** An hour in the viewer's browser only: a link can be turned off. */
const TILE_CACHE = "private, max-age=3600";

const tile = (relativePath: (params: Record<string, string>) => string) => ({
  handler: async (request: { params: Record<string, string> }) => {
    const { token, sheetId, versionId } = request.params;
    await sharedTileVersion(token!, sheetId!, versionId!);
    return serveTile(versionId!, relativePath(request.params), TILE_CACHE);
  },
});

export const publicRoutes: PublicRoutes = {
  "GET /s/:token/:sheetId/drawing": { handler: async (request) => sharedDrawing(request.params.token!, request.params.sheetId!) },
  "GET /s/:token/:sheetId/tiles/:versionId/plan.dzi": tile(() => "plan.dzi"),
  "GET /s/:token/:sheetId/tiles/:versionId/thumb.jpg": tile(() => "thumb.jpg"),
  "GET /s/:token/:sheetId/tiles/:versionId/plan_files/:level/:tile": tile((params) => `plan_files/${params.level}/${params.tile}`),
  "GET /s/:token/:sheetId/pdf": { handler: async (request) => sharedPdf(request.params.token!, request.params.sheetId!) },
  "GET /s/:token/pdf": { handler: async (request) => sharedPdf(request.params.token!, null) },
};
