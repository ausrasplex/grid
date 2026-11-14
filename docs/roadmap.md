# Roadmap: start solo, grow into teams and multi-company jobs

Status: **agreed.** Build for a **sole trader first** and expand to teams, then builders and multi-company projects. Every phase is useful on its own, and later phases switch on without reworking earlier ones.

## Phases

| Phase | Build | Sole trader gets | Expands later to (larger businesses) |
|---|---|---|---|
| **0. Core (done: stage 1a)** | Accounts, company, roles, blocks, concept C shell | Sign in, own company | Teams, roles and invites are already built, just hidden while solo |
| **1. Solo core + real sign-in (done)** | Better Auth (replaces the dev sign-in), "Just me" setup, solo preset, team features hidden until a second person joins | Secure sign-in, a one-screen setup and short menus | Inviting the first worker reveals Members and Roles; nothing to migrate. The same sign-in later serves the hosted site and federation identity |
| **2a. Jobs on sites (done)** (`sites`, `projects`) | Private auto-sites from an address, jobs with Covers, Sites list (Active/Mine/Archived), site page with earlier jobs and site notes, breadcrumbs | A job list by address; history and access notes per house | Managed sites, buildings and levels in use, listed/unlisted projects (2b) |
| **2b-lite. Job photos & notes (done)** (`photos`) | Photos and notes on a job (and on a level), before/after tags, offline capture | All job photos in one place, ready for the customer or the CES | Photo pins on plans (done in 4b), shared with the chain |
| **2c. Storage clean-up (done)** (core) | Scheduled-jobs runner (pg-boss); unused uploads removed after 7 days and Recently deleted kept 30 days (both changeable in the app); Settings › Storage with restore, Delete now and the clean-up history | The server doesn't fill up with junk, and a mis-tapped delete can be undone | Same runner renders PDFs for the templates Block (phase 3) |
| **2d. Backups (done)** (core) | Choose database and/or media; daily or weekly; keep the latest N (oldest replaced); Back up now; history with Download per backup | A dead disk or a bad upgrade isn't the end of the business | Off-site copies, encryption, Restore button |
| **3. Quotes + signing (done: 3a, 3b)** (`templates` basics, `quotes`, `signatures`) | Clients, price book, quick quote on the phone, branded PDF, online client signing with one-time code, signed PDF; an accepted quote creates the job | Quote on site, client signs on their phone, job appears | Estimators, Foreman drafts with Owner review, full estimates with take-offs, signing in person and several signers |
| **4. Plans, markups, photo pins, measure (done: 4a, 4b)** (`plans`, `markups`) | Upload, tiled viewer, revisions, own markup layer, photo pins, calibrated measuring | Mark up and measure plans on the tablet | Company layers with visibility, plan update requests linked to RFIs |
| **5. Documents & assets** | Own manual library with search and product catalogue; tools, test & tag, van | Manuals on hand, test-and-tag reminders, van servicing | Sharing libraries with subcontractors, Shared notes, fleet-wide assets |
| **6. Offline sync, notifications, email** | Full offline, push, own SMTP | Works in plant rooms and basements | Team notifications and approvals |
| **7. Teams** | Members screen, invites, roles in use, My work across people, onboarding inductions | — | Foremen, apprentices, per-project roles |
| **8. Multi-company projects** (stage 2b proper) | Contract chain, company invites, site/project QR access, placement, managed sites, project listing | — | Builders hosting jobs, subcontractors under them |
| **9. Inductions & credentials** | Site/company/project/area inductions, wallet, sharing, compliance | (A solo trader still uses the wallet for their own tickets.) | Builder inductions, chain inductions, induction builder later |
| **10+.** | RFIs, revision requests, variations, SWMS & forms, reports, hosted site & federation | | |

The centre button grows with the phases too (`navigation.md` §5a): **Scan** today → **Take a photo** for a sole trader once Photos is on (2b-lite) → an **Actions** menu (Scan, Photo, …) for team members checked in to a site (phases 7–8).

## Grid, Blocks and the Store

- **Grid** is the app. **Blocks** are features that expand the core (Quotations, Assets, Documents…). Each Block is a package in `blocks/` with a `defineBlock` manifest.
- **The Store** is where a business adds or removes Blocks. **Now:** a built-in catalogue of Grid's own Blocks, all free on self-hosted. **Later:** the hosted site can charge for some Blocks and list third-party ones. The manifest and the `CompanyBlock` switch are already shaped for that, so no rework is needed.
- **Core blocks** (`required: true`) show in the Store with a **Core** badge and can't be removed. **Decided: the core is**
  - sign-in and accounts;
  - the business, team and roles;
  - **Sites & Jobs**;
  - the app frame: Home, Settings, the Store, the centre button, Jump to search and notifications.

  Everything else is an optional Block. In the code, Sites & Jobs is still written as a Block (`blocks/sites`, `blocks/projects`) but marked `required: true`. Other Blocks can rely on it always being there. Making it optional later would mean changing that one flag and letting screens cope without it.

Detailed designs: `photos-block.md`, `backups.md`, `stage-2-projects.md`, `quotations-block.md`, `templates-block.md`, `documents-block.md`, `assets-block.md`, `inductions-credentials.md`, `navigation.md`, `visual-style.md`, `deployment-modes.md`.

## Phase 1: solo core and real sign-in

### Sign-in (Better Auth)

**Built (Better Auth 1.7.18 with Prisma 7.10, confirmed working together).**

- `apps/web/src/lib/auth.ts` is the Better Auth set-up; `lib/session.ts` is the only place the app asks who's signed in, so blocks don't change. The development sign-in is gone.
- Tables `Session`, `Account`, `Verification` are in the core schema (`prisma/schema/auth.prisma`); `User` gained `emailVerified`, `image` and `serverAdmin`. Ids are UUIDs, the same as everything else.
- Sessions are checked against the database on every request, so signing a device out takes effect straight away.
- **Invited people** exist as users without a password. They sign in with an emailed link (only existing people can use links) and add a password under Settings › Sign-in & devices. Phase 7 adds a proper invite-acceptance screen.
- Settings: `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`, `TRUSTED_ORIGINS`, `SIGNUP_MODE` (Unraid template). The email server is set in the app: Settings › Email (server admin), with provider presets and a test button.
- **Ways to sign in:** email and password, plus a **sign-in link by email**, which is handy on a phone on site.
  - Passkeys (Face ID / fingerprint) come after.
  - Google / Microsoft sign-in is optional and switched on per server.
- **Sessions:** long-lived on the person's own phone or tablet, so nobody signs in every morning. A server admin can see and revoke devices.
- **Self-hosted:** invite-only (`deployment-modes.md`). The first account on a fresh server becomes the server admin.
- **Hosted (later):** open sign-up uses the same setup, and federation identity builds on it.
- **Sign-in emails:** sign-in and verification emails stay platform-controlled (`templates-block.md`). They use the server's SMTP settings, or a console log in development.



### "Just me" setup

- Sign-up asks two things: **trade** (as now) and **"Just me" or "With a team"**.
- **Just me:** the company is created with the person as **Owner** and named from their business name (or their own name). It needs no ABN up front; that can come later, when it's needed on a quote. They land on Home straight away.
- **With a team:** the current flow, which goes on to invite people.
- Both create the same records. "Just me" is not a separate kind of company.

### Team features appear when they're needed

- **Solo** is worked out from the company itself, not stored as a setting: one active member and no pending invites.
- While solo:
  - **Members and Roles** are hidden from menus and settings. One entry stays visible: **"Add a team member"** in Settings.
  - Role pickers, "assign to person", approvals and Foreman review steps are skipped. The Owner can do everything.
  - The account sheet and Settings show **"Business"** instead of "Company" in labels where it reads better.
- **When the first invite is sent**, Members and Roles appear and assignment and approval steps switch on, with no migration needed.
- **If the company drops back to one person**, the extra screens hide again, and all history is kept.
- Blocks mark team-only menu items with `teamOnly: true` on the menu item. The shell hides them while the company is solo. `soloOnly: true` does the opposite (used for "Add a team member"), and `soloLabel` swaps a label while solo ("Business details").
- `RequestContext.solo` carries the answer to every page and API call, so a Block can skip assign-to-person or approval steps while solo.

### Solo preset

- A **business size** choice sits alongside the trade preset (`startingBlocks(trade, size)` in `blocks/companies/presets.ts`). Blocks that aren't built yet are skipped, so a new company today starts with only the core. Solo turns on: `sites`, `projects`, `photos`, `quotes`, `templates`, `plans`, `markups`, `documents`, `assets`.
- It leaves the team blocks off (`rfis`, `revisions`, `variations`, `swms`, `forms`, team `inductions`). They're one switch away in Settings › Blocks.

## Rules that keep expansion free

Every block follows these from day one, even while only sole traders use the app:

1. **Everything is company-scoped.** Every record has a `companyId` (or reaches one through its project), even when the company is one person. Adding staff never needs a data migration.
2. **Permissions are always checked.** Solo Owners simply hold every permission. Screens are never built on the assumption that "the user can do everything", so adding Employees and Foremen just works.
3. **A job is a full project.** A solo job still has a site (private, auto-created), a host company (yours) and one `ProjectCompany` row (you as host). The contract chain exists with one link, so inviting a subcontractor later adds a row; it doesn't change the job.
4. **Houses are sites.** Private auto-sites use the same Site → Building → Level model with one single-level building. Converting to a multi-building or managed site is an edit, not a migration.
5. **Hide, don't fork.** Team and multi-company features are hidden by `teamOnly` menus, block switches and solo detection. There's never a separate "solo app" or a second code path for the same screen.
6. **Visibility rules exist from the start.** Markup layers, photo and note visibility (Private / Shared), and project listing are stored on every record, with solo defaults, so sharing with a builder later is a setting change.
7. **IDs and route codes are global from the start.** Route codes carry the server prefix (`navigation.md` §7), so QR stickers and links printed by a solo trader keep working when the app moves to the hosted site or joins federation.
8. **No hard limits on size.** Lists paginate, searches use indexes, and nothing assumes "a handful of jobs", so a 50-person company works on the same code.
