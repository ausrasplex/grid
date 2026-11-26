# Stage 2 — Sites & Projects: agreed design

Status: **2a built** (November 2026); 2b agreed, not built. Built in two parts: **2a** (jobs on sites, for sole traders) first, **2b** (multi-company) later. See `roadmap.md`.
Two blocks (see `ADDING_A_BLOCK.md` for the mechanics):
- `sites`: sites, buildings, levels, the Sites list and site QR. Depends on `companies`.
- `projects`: projects, Covers, the contract chain, invites and access. Depends on `companies` and `sites`.

Navigation, breadcrumbs, search and quick routes are specified in `navigation.md`. This doc covers the data, ownership and access rules behind them.

## Core rules

- **Every project belongs to one Site.** A site sets out its buildings and levels once; projects tick the parts they **Cover** (§1b). Plans, tasks, RFIs, variations and permissions still belong to the **project**, because that's where the contract chain lives.
- A project has one **host** (root of the contract chain). Companies sit under the company that engaged them (`ProjectCompany.parentId`), forming the chain, e.g. Building Management → Builder → Company C → Company B → Company A → worker.
- Each `ProjectCompany` row is also the **contract** between that company and its parent. Pricing and variations on it are visible only to those two companies.
- **Hosts invite companies, not other companies' workers.** Each company chooses which of its own people work on the project and can set per-project roles (e.g. Foreman on this job only).
- **Safety overrides the chain:** host and main contractor always see everyone on site (inductions, SWMS sign-ons, tickets). Pricing never flows up.
- Every invite, request, approval, decline, placement, move and site-structure change is audit-logged.

## 1. Sites, buildings and levels (`sites` block)

### 1a. Structure

- **Site:** a precinct, shopping centre, school or house. Name, address, optional geofence, site notes (access, hazards: kept with the address so every job there sees them), as separate titled notes (`SiteNote`).
- **Building:** belongs to a site. Either **multi-level** (ordered levels, highest first, e.g. Roof, Level 7 … Ground, Basement) or **single-level** (no levels).
  - A single-level building can be converted to multi-level later; its existing work moves to "Ground".
- **Level:** belongs to a multi-level building. Full name ("Level 5") plus a short label ("L5") for phone breadcrumbs.
- **Zones** inside a level are optional and come later (plant room, east wing). The model leaves room for them.
- **Every level in a building has its own name (decided Nov 2026).** Two levels can't share a name; case and extra spaces don't count ("Level 3" = "level  3"). The server refuses a clash when adding or renaming (`levelNameClashes` in `blocks/sites/address.ts`), and the Add levels and Rename sheets say so before you save. Short names are unique too: a typed one must be free; a worked-out one gets a number added ("Carp", "Carp2"). Levels named the same from before this get a warning on Buildings & levels. Different buildings can still both have a "Level 1".
- **Full set of floors on a building that has some (fixed Nov 2026):** Add levels › A full set of floors skips floors the building already has (usually the "Ground" made when it was given levels) and says so; the new ones above ground go above the top floor and the ones below go under the bottom one. A building with only Ground opens on the full set.
- **Car parking below ground (decided Nov 2026).** Floors below ground are basements ("Basement 2", B2) or car parking ("Parking 2", P2, like the lift buttons). Add levels › A full set of floors asks which; "Parking 3", "Car park 3" or "P3" typed as one level gets P3. A building with basements has **Basements are parking**, which renames every basement at once ("Basement" → "Parking 1", "Basement 2" → "Parking 2"; all or nothing if a name is taken). When renaming a level, its short name follows the name unless you changed the short name yourself.
- **What a floor is used for (decided Nov 2026).** A level keeps its number as its name ("Level 40", L40, as on drawings and lift buttons) and can have an optional **Used for** (`Level.use`): Plant room, Car park, Retail, Office, Residential… suggested, any words fine. It shows after the name wherever floors are listed or picked (`levelLabel`: "Level 40 · Plant room"), and above the level page title; phone breadcrumbs keep the short name. Set it when adding one level or in the level's edit sheet. A name like "Level 40 Plant room" still gets the short name L40.
- **Empty building or floor: start here (decided Nov 2026).** A floor page with no active jobs shows "Nothing on Level 3 yet", and a building page "Nothing in Building A yet", with **Add job** (opens New job with the site and that floor, or the whole building, already ticked: `/jobs/new/<site>/<building>[/<level>]`) and, when Quotes is on, **Add quote** (the `place.start` panel slot, `PlaceStartPanelProps`; other Blocks can add their own button there).
- **Car parks above ground (decided Nov 2026):** floors keep their names (Ground, Level 1…) with Used for **Car park**. Two ways to set several at once: **Set what floors are used for** on a building (pick From and Up to, then any use, or empty to clear; `POST /api/sites/buildings/<id>/levels/use`), and on Add levels › A full set of floors, **Some floors above ground are car parking** with From and Up to, marked as soon as the floors are added (floors already there count too).
- **Deleting a floor (decided Nov 2026): only empty floors.** The bin on each floor's row on Buildings & levels deletes it (owner company, `sites.structure.edit`). Grid first asks every Block what is filed to it (`levelUsage` in the Block manifest: photos and notes, plan sheets, jobs whose Covers name that floor), counting Recently deleted too, from any business. If anything is there it says what ("12 photos, 1 job covers it") and won't delete; an empty floor is deleted for good after a confirm. Remembered places on it fall back to the building (`sites.level.deleted`).

### 1b. Project Covers

- When creating a project (or later in **Project settings › Covers**), the host ticks the buildings and levels it works on. Ranges are quick to pick (L3–L5).
- **Whole building** includes levels added to that building later.
- A single-level building is just ticked on or off.
- Covers drives:
  - which projects appear on a level, and on the level picker's project counts;
  - the project's **Other work areas** shortcut;
  - which area inductions apply (see `inductions-credentials.md` §1).
- Shrinking Covers never deletes work: items on a removed level stay in the project and show under "Outside current areas" until moved or archived.

### 1c. Who owns a site

| Site kind | Created by | Who can edit buildings/levels | Shared with |
|---|---|---|---|
| **Managed** (precincts, centres, schools) | Building management, or a builder setting up the first project there | The **site owner company** (and companies it appoints as site editors) | Every company with a project at the site |
| **Private** (houses, small jobs) | Created automatically from the job address when a company starts a job | The company that created it | That company only |

- **Hosts of projects on a managed site can propose new buildings or levels.** The site owner approves. If the site has no active owner (e.g. the builder that created it has left), any current host can make the change, and it's logged.
- **Claiming a site:** building management can **claim** a managed site a builder created. The current owner approves, or the platform/server admin decides if they're gone. The structure, projects and history stay, and the building induction moves to the new owner.
- **Duplicates:** when someone creates a managed site, existing managed sites at the same address are offered first ("Riverside Health Precinct already exists — request to add a project here?"). Private sites are never offered to other companies.
- Site structure (buildings and levels) is plain fact, like the product catalogue. Visibility of what happens there is controlled per project (§1d).

### 1d. What other companies see at a site

- **Projects you're on:** everything your role allows.
- **Other projects at the same managed site:** the host chooses per project:
  - **Listed** (default on managed sites): name, builder and Covers are visible to people with any project at the site, so trades know who else is on Level 5. Nothing inside it (plans, people, tasks) is visible.
  - **Unlisted:** invisible to anyone not on the project.
- **Archived projects** at a level show only as a count ("13 Archived") to people who aren't on them. Their names are visible only to companies that were on them.

### 1e. Automatic sites and archiving

- **Small jobs:** starting a job at an address creates a hidden **private site** with one single-level building ("House"). The Building and Level crumbs hide themselves, so a house reads `12 Smith St ▾ › Switchboard Upgrade ▾`.
- **Converting:** a private site can be given more buildings or levels later (granny flat, second storey) without moving any work.
- **Archiving:**
  - A site **archives itself** when its last active project (for the viewing company) closes.
  - Starting a new job at an archived address **reactivates** that site instead of creating a duplicate. Earlier jobs and site notes come back with it.
  - **Earlier jobs live on the site page, never inside a project.**
- **Sites list:** Active · Mine · Archived tabs, search by address, client or site name, most recently opened first (see `navigation.md` §4).

### 1f. Site QR code (gate sign)

- **One QR per site** for the gate sign, plus an optional **per-project QR** for a project's own induction pack.
- Scanning the site QR opens the site's join page: address, site basics, emergency info, and the **listed** projects there, so the person picks the project they're working on.
- Scanning a project QR skips straight to that project.
- Both only let someone **ask** for access (§3). Codes use the route-code system in `navigation.md` §7, can be regenerated (the old code stops working), given an expiry, or switched off.

### 1g. Project setup (host)

- Create project: name, site (pick an existing site, create a managed site, or let a private site be created from the job address), Covers, then plans.
- **Client (Nov 2026):** a job's client is picked from (or added to) the shared Clients list (core `clients` Block, see `quotations-block.md` §1). `Project.clientId` points at it; `Project.clientName` is a copy of the name for lists and search, kept in step by the `clients.renamed` event. Picking a client with an address fills in an empty job address. Jobs made before this got a client record each (matched by name) in the migration.
- Host's own staff are added directly (same company).

## 2. Inviting a company

From the project **Team** tab → "Invite company" (`ActionButton` in the header; icon-only on phones). Host:

- **Finds the company:** search existing companies by name or ABN, or enter an email for a company not on the app.
- **Sets terms:** trade/scope, whether they may subcontract (`canSubcontract`), which documents/plan sets they see, optional discipline ownership (e.g. E-series sheets, approval-required or trusted).

Compliance: the host/parent can attach **required compliance items** (insurances, licences, subcontractor statements) to the invite; until met, the company is "Compliance pending" with site basics only. See `inductions-credentials.md` §12.

Then:

- Company on the app → its Owners are notified and **accept or decline**. Nothing is shared until accepted.
- Company not on the app → email with a sign-up link. They create their account + company (trade preset), and the invitation is waiting.
- Company Owner/Foreman then picks which staff work on the project.
- Subcontracting companies invite their own subs the same way, so the chain builds itself.
- Invitations expire (default 14 days); host can resend or cancel.
- Removing or finishing a company revokes its people's access; its markups, RFIs and history stay in the project.

**Guests:** host can invite an individual (client, consultant, certifier) as a view-only guest on chosen plans and reports, with no company needed.

## 3. QR codes: requesting access when nobody has assigned it

- The **site QR** (gate sign) and optional **project QR** are described in §1f. On the site QR, the person picks a listed project first; unlisted projects can only be joined through their own project QR or an invite.
- Scanning opens the app (or the website if the app isn't installed), via the route-code rules in `navigation.md` §7.
- **A QR code only lets someone ask for access; it never grants it.**

Routing:

| Situation | Request goes to |
|---|---|
| Has account, company already on project | Their own company's Foreman/Owner |
| Has account, company not on project | Host, as "Company X wants to join" (see §4) |
| Has account, says which company engaged them and that company is on the project | That engaging company directly; host notified and can override |
| No account | Sign up on the spot, join or name their company → one of the above |

- **While pending:** the worker sees site basics only (address, site contacts, emergency info, induction details). No plans, markups or documents.
- Approver sees name, email, company and scan time.
- Approvals are fast: approve from the push notification; Foremen can approve several pending requests at once (e.g. at pre-start).
- Safeguards: approval always required, rate limiting on repeat requests, optional location check (request must come from near the site).

## 4. Placing a company in the chain (host)

When a company's request reaches the host, the host chooses where it sits:

- directly under the host, or
- under the builder or any company already in the chain, using a **chain picker** that shows the tree.

**Placement needs the parent's consent.** Placing Company A under Company B creates a contract link B must agree to:

1. Host proposes the placement.
2. Company B's Owner/Foreman confirms ("Company A is our subcontractor") and sets the terms (scope, may subcontract, documents shared), or declines with a reason, which returns the request to the host.
3. Company A accepts the project; A's Owner approves the worker if they haven't already.
4. Worker gets access according to what B shares.

**If the parent is slow to respond:** host can give A temporary access directly under the host, marked **"Placement pending: Company B"**. It gets site basics and safety only, so the worker can do inductions and sign the SWMS on day one. Once B confirms, A moves under B and B's sharing rules apply.

**Why the host can't place a company unilaterally:** B would become responsible for a company it never engaged; "Up the chain" visibility would expose A's work to B (and B's upward) without consent; and the chain must match real contracts for disputes.

## 5. Moving a company to a different parent

- Host can move a company mid-job; the **new parent must confirm** (same as §4).
- Kept: the company's markups, RFIs and history.
- Recalculated: visibility for the new chain (`ancestorIds`).
- Stays put: **variations remain on the old contract** they were raised on, because pricing and approvals belong to that agreement.
- The old parent is notified.

## Data model sketch (to refine at build time)

`sites` block:
- `Site`: `kind` (`MANAGED | PRIVATE`), `ownerCompanyId`, `name`, `address`, `addressKey` (normalised, for duplicate checks), `geofence?`, `createdById`. Site notes are `SiteNote` rows (siteId, companyId of whoever added it, title, body, sort, soft delete); the old `Site.notes` text became one note called "Site notes" (migration `20261114170000_site_notes`). Archiving is per company (`SiteCompanyState`).
- `SiteEditor`: `siteId`, `companyId` (companies the owner appoints to edit structure).
- `Building`: `siteId`, `name`, `kind` (`MULTI | SINGLE`), `order`.
- `Level`: `buildingId`, `name`, `shortName`, `order` (highest first). `Zone` later: `levelId`, `name`.
- `SiteStructureProposal`: `siteId`, `proposedByCompanyId`, `change Json`, `status`, `decidedById`.
- `SiteClaim`: `siteId`, `claimingCompanyId`, `status`, `decidedById`.
- `SiteCompanyState`: `siteId`, `companyId`, `archivedAt?` (auto-set when the company's last active project there closes).
- `UserSiteLocation`: `userId`, `siteId`, `buildingId?`, `levelId?`, `projectId?`, `updatedAt` (where you last were on each site; follows the user across devices).
- QR and short links use the shared `RouteCode` table (`navigation.md` §8).

`projects` block:
- `Project`: add `siteId` (required), `listing` (`LISTED | UNLISTED`, default LISTED on managed sites, UNLISTED on private).
- `ProjectCover`: `projectId`, `buildingId`, `levelId?` (null = whole building, including future levels).
- `UserProjectLevel`: `userId`, `projectId`, `levelId`, `updatedAt` (last level used on a project; where search results land).
- `ProjectReference`: `projectId`, `companyId`, `label`, `value` (each company's own job/PO number; only that company sees and searches it).
- `ProjectCompany`: add `status` values `INVITED | PENDING_PARENT | PENDING_PLACEMENT | ACTIVE | COMPLETED | REMOVED`, `invitedById`, `termsJson`, `expiresAt`.
- `ProjectInvite`: company or email target, terms, expiry, status.
- `ProjectAccessRequest`: requester, project, claimed company, claimed engaging company, routedTo (company), status, decidedBy, location check result, `viaCode` (site or project QR).
- `PlacementProposal`: child company, proposed parent, proposedBy, status, decision note.
- `ProjectMember`: user, projectCompany, optional project role override.

## Build order (solo first, see `roadmap.md`)

**Sites & Jobs is core** (decided: option 1 in `roadmap.md`, "Grid, Blocks and the Store"). Both `sites` and `projects` are written as Blocks but marked `required: true`, so every business has them, they show in the Store with a Core badge, and other Blocks can rely on them.

**2a. Jobs on sites (sole trader):**
1. `sites`: Site, Building, Level; private auto-sites from a job address; Sites list (Active/Mine/Archived); site page with earlier jobs and site notes; breadcrumbs and pickers.
2. `projects`: Project with site and Covers, Other work areas, project listing field (stored now, used in 2b). Each job gets one `ProjectCompany` row with your company as host, so the chain exists from day one.
3. Jump to search and route codes for sites and jobs (`navigation.md` §6–7).

**What 2a built, and decisions made while building it:**
- Blocks `sites` ("Sites") and `projects` (shown as "Jobs"), both `required: true`. The code keeps "project"; screens say "job".
- **Private sites** come from the job address (`addressKey` matching: "Street"/"St", state names, unit numbers). The same address reuses the company's site, reactivating it if archived. A new one gets one single-level building, "House".
- **Per-company site state** (`SiteCompanyState`): active/total job counts, archived date and search keywords (client and job names), kept up to date by the projects block. This is what the Sites list reads.
- **Job numbers:** `ProjectReference` with label "Job no.". Blank means the next one (J-1001, J-1002…); a typed number must be unique within the company.
- **"Mine" tab** = sites you've opened, until phase 7 adds people on jobs; hidden while solo.
- **New site before any job (decided Nov 2026):** the Sites list shows **New site** to anyone with `sites.create`, sole traders included (it was team-only). It makes a managed site with no jobs, goes straight to Buildings & levels, and the site shows under Active until it's used.
- **Structure editing:** add buildings (single or multi-level), add a full set of floors in one go (roof, levels, ground, basements) or one level above/below, rename, reorder, convert single → multi-level (creates "Ground" and emits `sites.building.converted`). Deleting buildings and levels is not built yet (needs a "what's on it" check across Blocks).
- **Quick routes:** `RouteCode` table (core), `/go/<code>` page, Copy link on site and job pages. Blocks declare `routeTargets` in their manifest.
- **Jump to:** `/jobs/search`, the header search (a box with Ctrl K from tablet up). Matches job numbers (exact first, "1042" finds "J-1042"), job names, clients, sites and addresses.
- Not yet: the camera scanner (Scan is still a placeholder page), plan sheets and quotes in search (they come with those Blocks), and "Outside current areas" (needs work items).

### Job storage, the Jobs table and archiving (decided Nov 2026, phase 2e)

Why: on a home server the disk is finite. The owner needs to see what each job uses and win space back from finished jobs **without losing anything**.

**Build order:**
1. Storage per job and the Jobs table.
2. Archive job.
3. Export job as a ZIP (the handover pack).
4. Later, only if space really runs short: Import, and moving archived originals to a second disk.

**1. Storage per job**
- Every Block that keeps files for a job reports them through a manifest hook, `jobStorage` (lazy, like `levelUsage`). It takes a business and a list of job ids, and returns one line per kind of thing: label, count, **originals** (bytes), **viewing copies** (bytes), **in Recently deleted** (bytes), and how many copies aren't measured yet. Core doesn't know about photos or plans; new Blocks (Sign-offs, Assets) add their own line.
- Every Block in the build is asked, even one the business has switched off: its files are still on disk.
- **Originals** are what people uploaded and can't be made again. **Viewing copies** are what Grid makes from them and can make again: photo thumbnails and full-screen copies, plan tiles, document page pictures and spreadsheet data. They're kept apart because copies are often bigger than the originals (a plan set at High is many times its PDF).
  - Photos: photo files and their thumbnails and full-screen copies.
  - Plans: sheets, revisions, the uploaded PDFs and images (a PDF shared by several sheets is counted once), and tiles.
  - Documents: the job's own documents and their versions, and page pictures and spreadsheet data. Library documents pinned to a job aren't counted: they belong to the library.
- **Measuring copies:** plan tiles and document pages live in the cache folder, so their size isn't in the database. Each render now records its size (`cacheBytes` on `PlanVersion` and `DocumentVersion`). Renders from before this have none: a nightly job in each Block (`plans.measure`, `documents.measure`, 3:30 am) measures those once. Until then the card says "not measured yet".
- **Where it shows:** a **Storage** section on the job page (side column), for people with `projects.complete` (they finish, reopen and archive jobs). It shows each line, the total and the copies.

**The Jobs table** (`/jobs`, menu **Jobs** under More)
- Every job of the business, one row each: job number, name, client, address, status (Active, Finished, Archived), started, and the counts from the Blocks (photos, plan sheets, documents). For people with `projects.complete` it also shows the size.
- Search (job number, name, client, address), status tabs (Active · Finished · Archived · All), and sort by any column ("Biggest first" is one tap). On a phone each row is a card; the table is for tablet and desktop.
- Sizes are worked out when the page loads (sums in the database, no disk reads). If that's ever slow with thousands of jobs, keep a nightly per-job total instead.
- Quoting and Not won jobs (phase 4c) show only under All, with their badge.

**2. Archive job** (`projects.complete`)
- Only a **finished** job can be archived. It stays `COMPLETED` with `archivedAt` set; the screens call it **Archived**.
- **Archiving keeps:** every original, every markup, pin, scale and sign-off (they're data, not pictures, so they land in the same place when redrawn), and the small thumbnails (photo thumbnails and plan sheet thumbnails, a few MB a job) so the photo grid and sheet list still show straight away.
- **Archiving deletes:** the big viewing copies (plan tiles, document page pictures and spreadsheet data). Photo full-screen copies are kept: they're small next to the originals, so dropping them would win little.
- **Opening an archived job is a quick look, not a restore.** The status stays Archived, with a banner: "Archived · Restore to work on it". It's read-only, like a finished job. Viewing copies are drawn **only for what you open, as you open it**: one sheet, one document. There's a "Getting this sheet ready…" wait of a few seconds at Medium, and up to a minute or more at Extreme.
- **Temporary copies:** each copy drawn for an archived job records when it was last opened. The nightly clean-up deletes those not opened for **1 day**; the day restarts each time it's opened. The time is a setting in **Settings › Storage**: 1, 3 or 7 days, default 1.
- **Restore** (`projects.complete`): clears `archivedAt`. The job goes back to Finished and everything is redrawn in the background, kept for good. Reopening an archived job restores it first.
- Written to the activity log: archived, restored.

**What parts 1–2 built (Nov 2026):**
- **Storage hook:** `jobStorage` in the manifest (`JobStorageLine` in `@grid/core`). Photos, plans and documents each report:
  - count, originals and copies;
  - `archiveBytes`, what archiving frees;
  - Recently deleted, and copies not measured yet.
- **Measuring:** `folderBytes()` in `@grid/db` measures a cache folder, and each render records its `cacheBytes`. `plans.measure` and `documents.measure` run at 3:30 and 3:35 am.
- **Where it shows:**
  - the job page's **Storage** section;
  - the **Jobs** table at `/jobs` (More menu). Sites stays highlighted there too, because job pages are under /jobs. The Archived tab shows once a job is archived.
  - The API is `GET /api/projects/table` and `GET /api/projects/<id>/storage`.
- **Archive job / Restore job** are on a finished job's page:
  - `POST /api/projects/<id>/archive` and `/restore`, for `projects.complete` and the host only, written to the activity log.
  - They send the events `projects.archived` / `projects.restored`, and Plans and Documents queue `<block>.archive` / `<block>.restore` jobs to drop or redraw their copies.
  - Reopening an archived job restores it.
- **Opening an archived job's copies:**
  - Plans: `PlanVersion.tilesDroppedAt` and `openedAt`. The viewer calls `POST /api/plans/version/<id>/open` for each revision it shows.
  - Documents: `DocumentVersion.copiesDroppedAt` and `openedAt`. Opening the document page does it (`getDocument` with the version on screen).
  - Photos don't change: they have no dropped copies.
- **Nightly clean-up:** it asks each Block's `dropArchivedCopies`, shown as `archived-copy` in the history, and respects dry run. **Settings › Storage › Keep redrawn copies of archived jobs** is 1, 3 or 7 days (`archivedCopyDays`, default 1).
- **Read-only:**
  - Adding plans or documents to an archived job (upload, new version, pin) is refused with "Restore it to add…".
  - Photos and notes are already read-only on any finished job.
  - Markups on an archived job's plans aren't blocked yet. They're tiny and kept anyway.
- **Redraw plans/documents** (Settings › Plans & PDFs) skips dropped copies, so it doesn't undo archiving.

**3. Export job as a ZIP** (the handover pack). **Moved to later (Nov 2026):** the owner decided archiving and the storage clean-up cover the storage worries; Export stays a maybe for a future handover feature.
- Photos in area folders, plans by sheet and revision, the job's documents in their folders, and a PDF summary (job details, counts, the photo report). Made in the background; a link to download it, kept for a week in the cache.
- It's a copy for the client, the builder or a shelf. It isn't a way to take a job out of Grid: the job stays.

**4. Later, not now:** Import (rebuilding every Block's records from a ZIP, across Grid versions) and "export then remove". They're a lot of work, and the ZIP would become the only copy, outside the backups. If archiving isn't enough, the next step is a setting that keeps archived jobs' originals on a second, cheaper disk or share, still inside Grid.

### Deleting a job (decided and built Nov 2026)

Highly destructive, so it has several safeties, and the server checks each one again:

- **Archived jobs only.** A job has to be finished, then archived, before Delete shows. It sits in its own **Delete this job** section on the job page, below Finish and Archive.
- **Owners only:** `projects.delete` has no grants, so only Owners have it unless a custom role is given it.
- **The business running the job, and nobody else on it.** If another business is on the job it can't be deleted.
- **Two boxes.** The first lists everything that goes (photos, plan sheets, documents, with their markups, notes and sign-offs, and the size) and what stays (its quotes, no longer linked; the client; the site; the activity log). The second needs the **job number typed exactly** (the name, for a job with no number) and **"I understand"** ticked. The Delete button then waits 3 seconds before it works.
- **Recently deleted first.** `Project.deletedAt` hides the job straight away, everywhere a job is looked up. Owners see it under **Jobs › Recently deleted** with **Put back**, which makes it an archived job again, until Recently deleted runs out (Storage settings, 30 days by default).
- **Then removed for good** by the nightly storage clean-up. Every Block's `purgeProject(projectId, companyId)` hook removes its records for the job (dependent Blocks first) and returns its files' ids. The clean-up removes those files and writes "removed for good" to the log.
  - Photos: photos, notes, comments.
  - Markups: markups, icon numbers, scales.
  - Plans: sheets, revisions, layers, tiles.
  - Documents: job documents and their page pictures and search text, folders, and pins of library documents (the library keeps the document).
  - Quotes: unlinked, kept.
  - Sites: last-opened places stop pointing at the job.
  - Jobs: the job, its areas, references and route code.
- In dry-run mode the history lists the job ("Deleted job") and nothing goes. Each step is in the activity log: deleted, put back, removed for good.

### Quoting jobs (decided Nov 2026, built in phase 4c part 2: see the roadmap's "What part 2 built")

A quote that needs plans (for a take-off) before the work is won gets a job to hold them.

- **When:** tapping **Take-off** on a quote that has no job. A quote already for a job (extra work on an existing job) uses that job's plans; no Quoting job is made.
- **What it is:** an ordinary job with status `QUOTING`, linked from the quote (`Quote.projectId`), at the quote's site, building and level (or a private site from its address, as usual). Same name as the quote.
- **Kept out of the way:** Quoting jobs don't show in the Sites list, the site's active jobs, Home "On site now", or the site's active count, so a site with only Quoting jobs stays archived/hidden. Jump to finds them, with a **Quoting** badge. The job page shows a banner: "Quoting: becomes a job when Q-1042 is accepted".
- **Won:** accepting the quote turns the job `ACTIVE` (instead of making a new one), keeping its plans, icons and markups. Job number as normal.
- **Not won:** a declined, withdrawn or expired quote closes the job as `NOT_WON`: kept with its plans (useful if the client comes back), hidden like the above, shown only from the quote. Reopening the quote puts it back to `QUOTING`.
- **Only from a quote:** you can't make a Quoting job from New job, and a Quoting job can't be switched to active by hand; the quote decides.

**2b. Multi-company (when teams and builders come on):**
4. Invites, chain, placement and moves (§2, §4, §5).
5. Site and project QR access requests (§1f, §3).
6. Managed-site ownership: editors, structure proposals, claims, duplicate checks.

### Job checklist (decided and built Nov 2026)

A to-do list on each job, ticked off as the work gets done. Its own optional Block, `checklists` (Checklist in the Store), on for every business by default (the preset, and the migration for businesses that already existed).

- **Where:** the top of the job page, above the work areas: it's for the whole job, not one level. Blocks put things there through the **`job.top`** panel slot (props `JobTopPanelProps` from `@grid/block-projects`). Not on a quote's job (Quoting / Not won).
- **Ticking:** tap the item. It records **who and when** ("Sam Lee · Today, 2:14 pm"; the name is kept with the tick, in case they leave the team) and goes to the bottom under **Done (n)**, folded away while there's still something to do. Tapping a done one puts it back. Two people ticking at once keeps the first tick.
- **Who can do what** (two permissions, so roles can split them):
  - `checklists.items.tick`, **Tick checklist items**: Owner, Foreman, Employee and Viewer, i.e. anyone who can see the job.
  - `checklists.items.manage`, **Add and remove checklist items** (and rename them): Owner, Foreman, Employee.
  - **Apprentices and trainees** are a custom role (Settings › Roles: copy Employee, switch "Add and remove checklist items" off), given to them on the Team page. They tick but don't change the list. Decided: set on the Team page by an Owner, never on your own Profile.
- **Adding:** the box at the bottom. Enter adds; several lines (typed with Shift+Enter, or pasted from notes) add one item each, with bullets, numbers and tick boxes taken off (`blocks/checklists/lines.ts`). New items go at the end.
- **Edit** (top right of the list, for those who can manage it): rename in place (saves when you leave the box) and a Bin on each. No reordering yet.
- **An archived job's list** is kept as it was: it can be read, not changed. A job's list goes when the job is deleted for good, and with a deleted business.
- Every add, rename, tick, untick and removal is in the activity log. The list belongs to the business that wrote it (`ChecklistItem.companyId`), ready for shared jobs in the contract chain.
- **Icons on plans have their own lists** (`ChecklistItem.markupId`), with the same permissions and the same ticking; they show in the icon's panel, not here. See "Checklists and photos on icons" in `docs/plans-block.md`.
