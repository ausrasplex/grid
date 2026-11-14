// THE list of blocks compiled into this build. Each stage of the build
// adds lines here — that's the only app change a new block needs
// (plus its package in apps/web/package.json and next.config.ts).

import "server-only";
import { BlockRegistry, configureApp, type AppServices } from "@grid/core";
import type { ReactNode } from "react";
import type { RequestContext } from "@grid/core";
import type { BlockPages, BlockPanels, PublicPages } from "@grid/ui";
import { db } from "@grid/db";

import users from "@grid/block-users/block";
import companies from "@grid/block-companies/block";
import sites from "@grid/block-sites/block";
import projects from "@grid/block-projects/block";
import photos from "@grid/block-photos/block";
import templates from "@grid/block-templates/block";
import signatures from "@grid/block-signatures/block";
import quotes from "@grid/block-quotes/block";
import plans from "@grid/block-plans/block";
import markups from "@grid/block-markups/block";

const definitions = [users, companies, sites, projects, plans, markups, photos, templates, signatures, quotes];

/** Lazy page loaders, keyed by block id. */
export const blockPages: Record<string, () => Promise<BlockPages>> = {
  users: async () => (await import("@grid/block-users/ui")).pages,
  companies: async () => (await import("@grid/block-companies/ui")).pages,
  sites: async () => (await import("@grid/block-sites/ui")).pages,
  projects: async () => (await import("@grid/block-projects/ui")).pages,
  photos: async () => (await import("@grid/block-photos/ui")).pages,
  templates: async () => (await import("@grid/block-templates/ui")).pages,
  quotes: async () => (await import("@grid/block-quotes/ui")).pages,
  plans: async () => (await import("@grid/block-plans/ui")).pages,
};

/** Lazy loaders for pages people see without signing in (/p/<block>/...). */
export const blockPublicPages: Record<string, () => Promise<PublicPages>> = {
  signatures: async () => (await import("@grid/block-signatures/ui")).publicPages,
  quotes: async () => (await import("@grid/block-quotes/ui")).publicPages,
};

/** Lazy panel loaders (pieces a block shows on other blocks' pages), keyed by block id. */
export const blockPanels: Record<string, () => Promise<BlockPanels>> = {
  photos: async () => (await import("@grid/block-photos/ui")).panels,
  plans: async () => (await import("@grid/block-plans/ui")).panels,
  markups: async () => (await import("@grid/block-markups/ui")).panels,
  quotes: async () => (await import("@grid/block-quotes/ui")).panels,
};

/** Renders the panels every switched-on block offers for a slot, in block order. */
export async function renderPanels(ctx: RequestContext, slot: string, props: Record<string, unknown>): Promise<ReactNode[]> {
  const out: ReactNode[] = [];
  for (const block of registry.blocks) {
    const load = blockPanels[block.id];
    if (!load || !(block.required || ctx.enabledBlocks.has(block.id))) continue;
    const Panel = (await load())[slot];
    if (Panel) out.push(<Panel key={block.id} ctx={ctx} {...props} />);
  }
  return out;
}

function boot(): AppServices {
  const registry = new BlockRegistry(definitions);
  // Event handlers only run for blocks the company has switched on.
  const events = registry.createEventBus(async (blockId, companyId) => {
    const definition = registry.get(blockId);
    if (!definition || definition.required || !companyId) return !!definition?.required;
    const rows = await db.companyBlock.findMany({ where: { companyId, enabled: true }, select: { blockId: true } });
    return registry.effectiveEnabled(rows.map((row) => row.blockId)).has(blockId);
  });
  // Imported lazily: mail.ts is server-only and pulls in nodemailer.
  const mail = {
    configured: async () => (await import("./lib/mail")).emailConfigured(),
    send: async (mail: Parameters<AppServices["mail"]["send"]>[0]) => (await import("./lib/mail")).sendMail(mail),
  };
  const jobs = {
    send: async (name: string, data: Record<string, unknown>) => (await import("./lib/jobs")).sendJob(name, data),
  };
  const services = { registry, events, mail, jobs };
  configureApp(services);
  return services;
}

// One instance per server process (survives Next.js dev hot reloads).
const globalStore = globalThis as unknown as { __grid?: AppServices };
export const services: AppServices = globalStore.__grid ?? boot();
globalStore.__grid = services;
configureApp(services);

export const registry = services.registry;
