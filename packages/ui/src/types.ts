import type { ReactNode } from "react";
import type { RequestContext } from "@grid/core";

/**
 * Renders every enabled block's panel for a slot, e.g. "job.area" (the
 * photos, plans… shown on a job for the area you're in). Lets a core page
 * show content from optional blocks without importing them.
 */
export type PanelRenderer = (slot: string, props: Record<string, unknown>) => Promise<ReactNode[]>;

/**
 * A page a block contributes. Rendered by the app at /b/<blockId>/<path>.
 * Pages are server components; interactive parts are client components
 * that call the block's API through api()/useApi().
 */
export type BlockPage = (props: { ctx: RequestContext; params: string[]; panels: PanelRenderer }) => ReactNode | Promise<ReactNode>;

/** What each block's "./ui" export provides: path ("" = index) -> page. */
export type BlockPages = Record<string, BlockPage>;

/** A panel a block puts into another block's page (server component). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type BlockPanel = (props: { ctx: RequestContext } & Record<string, any>) => ReactNode | Promise<ReactNode>;

/** What a block's "./ui" may also export as `panels`: slot -> panel. */
export type BlockPanels = Record<string, BlockPanel>;

/** A page for people who aren't signed in (customer links, verify). Rendered at /p/<blockId>/<path>. */
export type PublicPage = (props: { params: string[] }) => ReactNode | Promise<ReactNode>;

/** What a block's "./ui" may also export as `publicPages`: path -> page. */
export type PublicPages = Record<string, PublicPage>;
