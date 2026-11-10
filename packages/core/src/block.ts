// The contract every block fills in. A block is a folder with a
// block.ts that default-exports defineBlock({...}).

/** Permission keys are "<block>.<thing>[.<action>]", e.g. "rfis.create". */
export type Permission = string;

/** Built-in roles every company gets. Companies can add custom roles too. */
export const SYSTEM_ROLES = ["OWNER", "FOREMAN", "EMPLOYEE", "VIEWER"] as const;
export type SystemRole = (typeof SYSTEM_ROLES)[number];

/** Places in the UI a block can add menu items to. */
export const MENU_SLOTS = [
  "sidebar.main",
  "header.actions",
  "home.widgets",
  "project.tabs",
  "plan.toolbar",
  "settings.company",
  "settings.user",
  /** The Actions menu on the centre button, once checked in to a site (docs/navigation.md §5a). */
  "shell.quick",
] as const;
export type MenuSlot = (typeof MENU_SLOTS)[number];

export interface PermissionDef {
  key: Permission;
  label: string;
  description?: string;
}

export interface MenuItem {
  /** Unique across all blocks, e.g. "companies.members". */
  id: string;
  slot: MenuSlot;
  label: string;
  /** Icon name from the app's icon set (e.g. lucide). */
  icon?: string;
  href: string;
  /** Hidden unless the user has this permission. */
  permission?: Permission;
  /** Lower sorts first. Default 100. */
  order?: number;
  /**
   * sidebar.main only: where the item shows (docs/navigation.md §5).
   *  - "primary": phone bottom bar, tablet rail and desktop sidebar (e.g. Sites, My work). The phone bar fits two.
   *  - "main":    desktop sidebar top list (e.g. Quotes); under More on phone and tablet.
   *  - omitted:   under More everywhere (e.g. Assets, Documents, Inductions).
   */
  prominence?: "primary" | "main";
  /**
   * Team features (docs/roadmap.md, Phase 1). teamOnly items hide while the
   * company is solo (one active member, no pending invites); soloOnly items
   * show only then (e.g. "Add a team member").
   */
  teamOnly?: boolean;
  soloOnly?: boolean;
  /** Label to use while the company is solo, e.g. "Business details". */
  soloLabel?: string;
  /**
   * Other path prefixes that should highlight this item, e.g. Sites stays
   * highlighted inside a job: activeFor: ["/b/projects"].
   */
  activeFor?: string[];
}

/** Who is making a request, resolved once per request by the app. */
export interface RequestContext {
  userId: string;
  /** The company the user is acting as (company switcher). */
  companyId: string | null;
  permissions: ReadonlySet<Permission>;
  /** Blocks effectively enabled for companyId (see registry.effectiveEnabled). */
  enabledBlocks: ReadonlySet<string>;
  /**
   * The active company has one active member and no pending invites.
   * Worked out per request, never stored. While solo, blocks skip
   * assign-to-person, approvals and review steps (the Owner can do it all).
   * False when there's no active company.
   */
  solo: boolean;
}

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface RouteRequest {
  params: Record<string, string>;
  query: URLSearchParams;
  body: unknown;
}

export type RouteHandler = (ctx: RequestContext, request: RouteRequest) => Promise<unknown>;

export interface RouteDef {
  /** Required permission. Omit for "any signed-in user". */
  permission?: Permission;
  /** Reject when no active company is selected. Default true. */
  requireCompany?: boolean;
  handler: RouteHandler;
}

/** Keys look like "GET /", "POST /:id/invites". Paths are relative to /api/<blockId>. */
export type Routes = Record<string, RouteDef>;

/**
 * A request from someone who isn't signed in: a customer opening a quote
 * link, anyone checking a signed PDF. The block itself decides what the
 * link or code in the path allows; nothing else is trusted.
 */
export interface PublicRequest {
  params: Record<string, string>;
  query: URLSearchParams;
  /** Parsed JSON, or null. */
  body: unknown;
  /** The raw bytes when the body isn't JSON (an uploaded file), else null. */
  bytes: Uint8Array | null;
  /** Best guess at the caller's address (X-Forwarded-For when behind a proxy). */
  ip: string;
  userAgent: string;
}

export interface PublicRouteDef {
  handler: (request: PublicRequest) => Promise<unknown>;
  /** Largest body accepted, in bytes. Default 64 KB. */
  maxBytes?: number;
}

/** Mounted at /api/public/<blockId>. Same key style as Routes. */
export type PublicRoutes = Record<string, PublicRouteDef>;

export interface EventMeta {
  emittedBy: string;
  companyId: string | null;
  actorId: string | null;
}

// Handlers receive payloads typed by the emitting block's exported types.
export type EventHandler<P = any> = (payload: P, meta: EventMeta) => void | Promise<void>;

export interface BlockDefinition {
  /** Lowercase, e.g. "companies". Also the API prefix: /api/companies. */
  id: string;
  name: string;
  version: string;
  description?: string;
  /** Core blocks can't be switched off by a company. */
  required?: boolean;
  /** Block ids this one needs. Disabled automatically if any is off. */
  dependsOn?: string[];
  permissions?: PermissionDef[];
  /** Which built-in roles get which of this block's permissions. OWNER always gets all. */
  grants?: Partial<Record<Exclude<SystemRole, "OWNER">, Permission[]>>;
  menus?: MenuItem[];
  /** Lazy so a block's server code only loads when called. */
  routes?: () => Promise<Routes>;
  /** Routes for people who aren't signed in, at /api/public/<blockId>. Lazy. */
  publicRoutes?: () => Promise<PublicRoutes>;
  /** Events this block emits (documentation + validation). */
  emits?: string[];
  /** Events this block reacts to, from any block. */
  on?: Record<string, EventHandler>;
  /** Tables phones sync offline (used from stage 5). */
  syncTables?: string[];
  /** Notification types this block can send (used from stage 6). */
  notifications?: string[];
  /**
   * Where a quick-route code (QR / short link, docs/navigation.md §7) for
   * one of this block's things should open. Keyed by RouteCode.entityType,
   * e.g. { Project: (id) => `/b/projects/${id}` }.
   */
  routeTargets?: Record<string, (entityId: string) => string>;
  /**
   * Who may download a file this block attached (StoredFile.blockId).
   * Lazy, so the manifest stays free of server code. /api/files/<id> asks it.
   */
  fileAccess?: () => Promise<(ctx: RequestContext, fileId: string) => Promise<boolean>>;
  /**
   * The nightly storage clean-up asks each block to purge what people
   * deleted before `before` (Recently deleted has run out). Lazy, so the
   * manifest stays free of server code. See docs/photos-block.md.
   */
  cleanup?: () => Promise<BlockCleanup>;
  /**
   * Background work this block does, keyed by queue name, which must start
   * with the block id ("plans.render"). Lazy. Queue with app().jobs.send().
   */
  jobs?: () => Promise<Record<string, BlockJob>>;
}

export interface BlockJob {
  handler: (data: Record<string, unknown>) => Promise<void>;
  /** How long one run may take before it's given up (default 15 minutes). */
  expireInSeconds?: number;
  /** Tries after a failure (default 1). */
  retryLimit?: number;
}

/** One thing a clean-up removed (or would, in a dry run). */
export interface CleanupItem {
  companyId: string | null;
  kind: "unfiled" | "deleted-photo" | "deleted-note" | "deleted-plan" | "stray";
  label: string;
  refId?: string | null;
  bytes: number;
}

export interface BlockCleanup {
  purgeDeleted(options: { before: Date; dryRun: boolean }): Promise<CleanupItem[]>;
}

const ID_RE = /^[a-z][a-z0-9-]*$/;

export function defineBlock<const M extends BlockDefinition>(definition: M): M {
  if (!ID_RE.test(definition.id)) {
    throw new Error(`Block id "${definition.id}" must be lowercase letters, digits or dashes`);
  }
  for (const permission of definition.permissions ?? []) {
    if (!permission.key.startsWith(`${definition.id}.`)) {
      throw new Error(`Permission "${permission.key}" in block "${definition.id}" must start with "${definition.id}."`);
    }
  }
  const declared = new Set((definition.permissions ?? []).map((permission) => permission.key));
  for (const [role, keys] of Object.entries(definition.grants ?? {})) {
    for (const key of keys ?? []) {
      if (!declared.has(key)) {
        throw new Error(`Block "${definition.id}" grants undeclared permission "${key}" to ${role}`);
      }
    }
  }
  for (const menu of definition.menus ?? []) {
    if (menu.teamOnly && menu.soloOnly) throw new Error(`Menu "${menu.id}" can't be both teamOnly and soloOnly`);
    if (!(MENU_SLOTS as readonly string[]).includes(menu.slot)) {
      throw new Error(`Menu "${menu.id}" uses unknown slot "${menu.slot}"`);
    }
  }
  return definition;
}
