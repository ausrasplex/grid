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

- **Site:** a precinct, shopping centre, school or house. Name, address, optional geofence, optional site notes (access, hazards: kept with the address so every job there sees them).
- **Building:** belongs to a site. Either **multi-level** (ordered levels, highest first, e.g. Roof, Level 7 … Ground, Basement) or **single-level** (no levels).
  - A single-level building can be converted to multi-level later; its existing work moves to "Ground".
- **Level:** belongs to a multi-level building. Full name ("Level 5") plus a short label ("L5") for phone breadcrumbs.
- **Zones** inside a level are optional and come later (plant room, east wing). The model leaves room for them.

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
- **Sites list:** Active · Mine · Archived tabs, search by address, customer or site name, most recently opened first (see `navigation.md` §4).

### 1f. Site QR code (gate sign)

- **One QR per site** for the gate sign, plus an optional **per-project QR** for a project's own induction pack.
- Scanning the site QR opens the site's join page: address, site basics, emergency info, and the **listed** projects there, so the person picks the project they're working on.
- Scanning a project QR skips straight to that project.
- Both only let someone **ask** for access (§3). Codes use the route-code system in `navigation.md` §7, can be regenerated (the old code stops working), given an expiry, or switched off.

### 1g. Project setup (host)

- Create project: name, site (pick an existing site, create a managed site, or let a private site be created from the job address), Covers, then plans.
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
- `Site`: `kind` (`MANAGED | PRIVATE`), `ownerCompanyId`, `name`, `address`, `addressKey` (normalised, for duplicate checks), `geofence?`, `notes?`, `createdById`. Archiving is per company (`SiteCompanyState`).
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
- **Per-company site state** (`SiteCompanyState`): active/total job counts, archived date and search keywords (customer and job names), kept up to date by the projects block. This is what the Sites list reads.
- **Job numbers:** `ProjectReference` with label "Job no.". Blank means the next one (J-1001, J-1002…); a typed number must be unique within the company.
- **"Mine" tab** = sites you've opened, until phase 7 adds people on jobs; hidden while solo.
- **Structure editing:** add buildings (single or multi-level), add a full set of floors in one go (roof, levels, ground, basements) or one level above/below, rename, reorder, convert single → multi-level (creates "Ground" and emits `sites.building.converted`). Deleting buildings and levels is not built yet (needs a "what's on it" check across Blocks).
- **Quick routes:** `RouteCode` table (core), `/go/<code>` page, Copy link on site and job pages. Blocks declare `routeTargets` in their manifest.
- **Jump to:** `/b/projects/search`, the header search (a box with Ctrl K from tablet up). Matches job numbers (exact first, "1042" finds "J-1042"), job names, customers, sites and addresses.
- Not yet: the camera scanner (Scan is still a placeholder page), plan sheets and quotes in search (they come with those Blocks), and "Outside current areas" (needs work items).

**2b. Multi-company (when teams and builders come on):**
4. Invites, chain, placement and moves (§2, §4, §5).
5. Site and project QR access requests (§1f, §3).
6. Managed-site ownership: editors, structure proposals, claims, duplicate checks.
