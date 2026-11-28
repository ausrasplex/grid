# Adding a block

Example: the **Projects** block (stage 2).

## 1. Create the package

```
blocks/projects/
  package.json      name "@grid/block-projects", depends on core, db, ui, block-companies
  block.ts
  schema.prisma
  service.ts
  routes.ts
  validation.ts
  index.ts          public API for blocks that depend on projects
  ui/index.tsx      pages
```

## 2. Write the manifest

```ts
// blocks/projects/block.ts
import { defineBlock } from "@grid/core";

export default defineBlock({
  id: "projects",
  name: "Projects",
  version: "1.0.0",
  description: "Sites, contract chains and locations.",
  // Sites & Jobs is part of the core, so it can't be switched off.
  // Optional Blocks (Quotes, Assets…) leave this out.
  required: true,
  dependsOn: ["companies"],
  permissions: [
    { key: "projects.view", label: "View projects" },
    { key: "projects.create", label: "Create projects" },
    { key: "projects.companies.invite", label: "Invite companies to a project" },
  ],
  grants: {
    FOREMAN: ["projects.view", "projects.companies.invite"],
    EMPLOYEE: ["projects.view"],
    VIEWER: ["projects.view"],
  },
  menus: [
    // prominence: "primary" = phone bar + tablet rail + desktop sidebar (the phone bar fits two),
    // "main" = desktop sidebar top list, omitted = under More (docs/navigation.md §5)
    { id: "sites.list", slot: "sidebar.main", label: "Sites", icon: "building", href: "/sites", permission: "projects.view", order: 10, prominence: "primary" },
    { id: "projects.mywork", slot: "home.widgets", label: "My work", href: "/jobs/my-work", permission: "projects.view" },
  ],
  routes: async () => (await import("./routes")).routes,
  emits: ["projects.created", "projects.company.invited"],
  on: {
    // react to another block without importing it
    "companies.member.removed": async (e) => { /* revoke project access */ },
  },
});
```

## 3. Add its tables

Write `blocks/projects/schema.prisma`. If a model relates to a model in
another block (e.g. `Project` → `Company`), Prisma needs the back-relation
on both sides, so also add one line to that block's schema under its
"Back-relations" comment.

## 4. Register it in the app

- `apps/web/package.json`: add `"@grid/block-projects": "workspace:*"`
- `apps/web/next.config.ts`: add it to `transpilePackages`
- `apps/web/src/blocks.ts`: import the manifest, add it to `definitions`, and add its page loader to `modulePages`
- `blocks/companies/presets.ts`: already lists `projects` for every trade, so new companies get it on

## 5. Build its pages mobile-first

- Compose pages from `@grid/ui` blocks (`PageHeader`, `Section`, `List`, `ListRow`, `FormActions`, `Field`, `SelectField`) instead of custom layout. They already handle phone, tablet and desktop.
- Use theme tokens (`bg-card`, `text-muted-foreground`, `bg-primary`…), never hardcoded colours, so concept C and the optional light theme both work (`docs/visual-style.md`). Wrap plan drawings, PDF pages and other "paper" in `class="paper"` to keep them light.
- Any area that scrolls on its own (long lists in a card, sideways chip rows) goes in `<Scroller>` (or `axis="x"`), so phones and tablets get the edge fade instead of a scrollbar.
- Design for the phone first, then add `sm:` / `md:` classes to spread out on bigger screens. Never the other way round.
- Keep every tap target at least `h-touch` (44px). Use `size="lg"` for a form's submit button.
- Put counts in `PageHeader`'s `meta` (e.g. "12 members · 2 invited") rather than a separate heading, and the page's main action in `actions` as an `ActionButton`.
- On phones, lists use `TapRow` (one line each) and open a bottom `Sheet` for actions; show inline actions with `ListRow` from `sm:` up.
- Use a bottom `Sheet` for quick forms (like "Invite"), and a full page for long ones (like the role editor).
- Need a new menu icon? Add it to `packages/ui/src/icons.tsx`.
- Tailwind already scans the whole `blocks/` folder, so new classes just work.

## 6. Migrate and run

```bash
pnpm install
pnpm db:migrate     # name the migration e.g. "add-projects"
pnpm dev
```

Existing companies' built-in roles pick up the new permissions on the
next server start. Existing companies switch the block on under
Settings → Blocks (or write a one-off script to enable it for all).

## Putting content on another Block's page (panels)

A core page can show content from optional Blocks without importing them. The job page asks for the `job.area` panels:

```ts
// blocks/photos/ui/index.tsx
export const panels: BlockPanels = {
  "job.area": async (props) => {
    const { ctx, job, area, areas } = props as typeof props & JobAreaPanelProps;
    // ...render this Block's part of the job page
  },
};
```

For something about the whole job rather than one area (the Checklist), use **`job.top`** instead: it shows at the top of the job page, above the work areas, with `JobTopPanelProps` (`job: { id, name, status, archived }`).

Register the loader in `apps/web/src/blocks.tsx` (`blockPanels`). Panels only render when the Block is on for the company. The props each slot passes are typed by the Block that owns the page (e.g. `JobAreaPanelProps` from `@grid/block-projects`).

## When a business is deleted

A deleted business can be restored until the storage clean-up removes it for good (`roadmap.md`, "Deleting a business"). If your Block stores anything with a `companyId`, add both to its `cleanup` hook (see `blocks/photos/purge.ts`):

- `companyUsage(companyId)` returns counts for the Delete box (`[{ count, one: "photo", many: "photos" }]`). Leave it out if a count means nothing to the Owner (branding, signing links).
- `purgeCompany(companyId)` deletes your rows for that business. Files are removed by the clean-up afterwards, so don't delete them. Never remove what another business still uses: hand a shared job or site to the business still on it. Dependent Blocks run first (reverse dependency order).

## Files

Upload with `POST /api/files`, then attach the file to your record with `attachFile(tx, fileId, { companyId, userId, blockId })` in the same transaction. Declare who may download it:

```ts
fileAccess: async () => (await import("./service")).canReadMyFile, // (ctx, fileId) => Promise<boolean>
```

## Background work on a schedule

A block job can also run on a timetable: add `schedule` (a cron line in the server's time zone) to it in `jobs`, e.g. `"credentials.remind": { handler, schedule: "0 7 * * *" }` for 7 am daily. It still runs when queued with `app().jobs.send()`.

## A card on Home

Put a panel in the `home.top` slot (`panels: { "home.top": async ({ ctx }) => … }`): it shows at the top of Home. Return null when there's nothing to say.

## Tiles and "Needs attention" on Home (Soft look)

In the Soft theme Home has a hero card with up to three numbered tiles and a "Needs attention" list. Put a `<HomeTile label value foot progress href />` (from `@grid/ui`) in the `home.tiles` slot, and `<AttentionRow title badge tone description href />`s in `home.attention`. Home colours and numbers the tiles; return null when you have nothing. These panels are run straight away (`resolvePanels`), so they can't use hooks.

## A second status on jobs

To say something about each active job after "Active" ("Active • Scheduled", "To be booked"), add `jobSecondStatus` to the manifest: `async () => (ctx, projectIds) => Record<jobId, JobSecondStatus>` (`{ key, label, hint, tone }` from `@grid/core`). It's asked once for a whole list. Jobs show it on the job page, the Jobs table (with a filter by `key`) and every job list (`JobRows`). The job's own status never changes. Scheduling is the one that uses it.

## A section on a client's page

`/clients/<id>` shows a client's details, then the panels in the `client.page` slot (props `ClientPagePanelProps` from `@grid/block-clients`: `clientId`, `clientName`). Projects shows their active and recent finished jobs; Quotes shows their open quotes. Return null when you have nothing with that client.

## Things filed to a floor

If your Block stores a `levelId` (a photo, a sheet, an inspection), say how many things are on a level, so a floor is only deleted when it is empty. Count every business and include Recently deleted (separately worded):

```ts
levelUsage: async () => (await import("./service")).levelUsage, // (levelId) => Promise<{ count, one, many }[]>
```

## Errors

Throw `badRequest`, `forbidden`, `notFound` or `conflict` from `@grid/core`. The app checks them with `isHttpError()`, not `instanceof`, because the bundler can load a second copy of the core module for a Block.
