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
   * highlighted inside a job: activeFor: ["/jobs"].
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
  /**
   * The first word of this block's page addresses, when it isn't the id:
   * the projects block's pages are at /jobs/... because the screens say
   * "job". Default: the id (/sites, /plans/sheet/<id>). Can't be one of
   * RESERVED_ADDRESSES (the app's own pages).
   */
  address?: string;
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
   * e.g. { Project: (id) => `/jobs/${id}` }.
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
   * What this block has filed to a level (photos, notes, plan sheets, jobs
   * that cover it), counting anything still in Recently deleted. A floor is
   * only deleted when every block says it has nothing there. Lazy.
   */
  levelUsage?: () => Promise<(levelId: string) => Promise<LevelUsage[]>>;
  /**
   * What this block keeps on disk for jobs (photos, plan sheets, documents),
   * for the job's Storage section and the Jobs table. Asked even when the
   * business has the block off: its files are still there. Lazy.
   * See docs/stage-2-projects.md "Job storage".
   */
  jobStorage?: () => Promise<(companyId: string, projectIds: string[]) => Promise<JobStorageLine[]>>;
  /**
   * Draws this block's part of a plan sheet for a shared plan link or a
   * plan PDF (markups and icons): SVG elements in sheet units (x 0 → 1
   * across, y 0 → height/width down), only what's on the chosen layers,
   * never anything marked "Just me". Asked only when the business has the
   * block on. Lazy. docs/plans-block.md "Sharing plans".
   */
  planDrawing?: () => Promise<(input: PlanDrawingInput) => Promise<string>>;
  /**
   * Background work this block does, keyed by queue name, which must start
   * with the block id ("plans.render"). Lazy. Queue with app().jobs.send().
   */
  jobs?: () => Promise<Record<string, BlockJob>>;
}

/** What to draw on a plan sheet for a share link or a plan PDF (planDrawing). */
export interface PlanDrawingInput {
  companyId: string;
  projectId: string;
  sheetId: string;
  /** The revision shown. */
  versionId: string;
  /** Every revision of the sheet (things drawn on older ones carry over). */
  versions: { id: string; revision: string; createdAt: Date }[];
  /** Sheet layers to draw (PlanLayer ids), and whether Default is one of them. */
  layerIds: string[];
  withDefault: boolean;
  /**
   * Someone signed in asked (the viewer's Download PDF): draw only what
   * they may see (the block's own view permission). Absent for a share link.
   */
  viewer?: RequestContext;
}

/** "12 photos", "1 plan sheet in Recently deleted": a count with its words. */
export interface LevelUsage {
  count: number;
  one: string;
  many: string;
}

/**
 * One kind of thing a block keeps for one job: "38 plan sheets, 220 MB,
 * plus 2.1 GB of tiles". Lines with nothing in them can be left out.
 */
export interface JobStorageLine {
  projectId: string;
  /** Unique across blocks, e.g. "plans.sheets". */
  key: string;
  /** "Plans", for the Storage section and the Jobs table column. */
  label: string;
  count: number;
  one: string;
  many: string;
  /** What people uploaded: can't be made again. */
  originalBytes: number;
  /** What Grid made from them (thumbnails, tiles, page pictures): can be made again. */
  copyBytes: number;
  /** The part of copyBytes that archiving the job removes (plan tiles, page pictures; not small thumbnails). */
  archiveBytes: number;
  /** Still on disk in Recently deleted (originals and copies). */
  deletedBytes: number;
  /** Copies whose size isn't known yet (made before sizes were recorded). */
  unmeasured: number;
}

export interface BlockJob {
  handler: (data: Record<string, unknown>) => Promise<void>;
  /** How long one run may take before it's given up (default 15 minutes). */
  expireInSeconds?: number;
  /** Tries after a failure (default 1). */
  retryLimit?: number;
  /** Also run it on a schedule: a cron line in the server's time zone, e.g. "0 7 * * *" (7 am daily). */
  schedule?: string;
}

/** One thing a clean-up removed (or would, in a dry run). */
export interface CleanupItem {
  companyId: string | null;
  kind: "unfiled" | "deleted-photo" | "deleted-note" | "deleted-plan" | "deleted-ticket" | "deleted-document" | "deleted-business" | "deleted-job" | "archived-copy" | "stray";
  label: string;
  refId?: string | null;
  bytes: number;
}

export interface BlockCleanup {
  purgeDeleted?(options: { before: Date; dryRun: boolean }): Promise<CleanupItem[]>;
  /**
   * Archived jobs (phase 2e): viewing copies drawn again when someone opened
   * one, last opened before `openedBefore`, are removed again (originals and
   * thumbnails stay). docs/stage-2-projects.md "Job storage".
   */
  dropArchivedCopies?(options: { openedBefore: Date; dryRun: boolean }): Promise<CleanupItem[]>;
  /**
   * Deleting a business (docs/roadmap.md "Deleting a business"): what this
   * block holds for it, for the confirmation ("12 jobs, 240 photos").
   */
  companyUsage?(companyId: string): Promise<LevelUsage[]>;
  /**
   * The business has been deleted for longer than Recently deleted keeps
   * things: remove this block's records for it for good. Files (StoredFile)
   * are removed by the clean-up afterwards, so only rows go here. Never touch
   * what another business still uses (a shared job or site).
   */
  purgeCompany?(companyId: string): Promise<void>;
  /**
   * Deleting a job (docs/stage-2-projects.md "Deleting a job"): an archived
   * job was deleted longer ago than Recently deleted keeps things. Remove
   * this block's records for the job for good, and any cached copies on
   * disk, and return the StoredFile ids of its files: the clean-up removes
   * those afterwards. Runs dependent Blocks first (markups before plans
   * before jobs).
   */
  purgeProject?(projectId: string, companyId: string): Promise<string[]>;
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
