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
| **2e. Job storage, the Jobs table and archiving** (parts 1–2 done Nov 2026; Export moved to later) (`projects` + every Block with files) | Storage card on each job (originals and viewing copies per Block); a searchable Jobs table with counts and sizes; Archive job (drops the viewing copies, redrawn for 24 hours when opened) | See what's filling the server and win the space back from finished jobs without losing anything; a handover pack for the client | Maybe later: Export job as a ZIP (handover pack), Import, moving archived originals to a second disk; see `stage-2-projects.md` "Job storage" |
| **3. Quotes + signing (done: 3a, 3b)** (`templates` basics, `quotes`, `signatures`) | Clients, price book, quick quote on the phone, branded PDF, online client signing with one-time code, signed PDF; an accepted quote creates the job | Quote on site, client signs on their phone, job appears | Estimators, Foreman drafts with Owner review, full estimates with take-offs, signing in person and several signers |
| **4. Plans, markups, photo pins, measure (done: 4a, 4b)** (`plans`, `markups`) | Upload, tiled viewer, revisions, own markup layer, photo pins, calibrated measuring | Mark up and measure plans on the tablet | Company layers with visibility, plan update requests linked to RFIs |
| **4c. Trade icons and take-offs** (planned: after 5b) (`markups`, `quotes`, `projects`, `documents`) | A symbol library for every trade (accordion per trade, with search) placed on plans; counts per sheet, level and job; take-offs into quotes; Quoting jobs so a quote can have plans before it's won; a manual linked to an icon type opens from a placed icon | Count 42 GPOs off the drawings and have them priced on the quote; the same icons become the install plan when the job is won | Assemblies behind icons, custom icon artwork, trades sharing plans with their own icon layers (phase 8) |
| **5a. My tickets & licences (the wallet, first part) (done)** | Your own tickets and licences (White Card, electrical licence, EWP…) with card photos, numbers and expiry dates; reminders before they run out | Every ticket on your phone; never caught out by an expired licence | Sharing with a business, inductions, site requirements and the employer-only section (phase 9) |
| **5b. Documents** (part 1 done: libraries, job documents, viewer) (`documents`, `signoffs`) | Own manual library; job documents (fit-off sheets, points lists) with a built-in spreadsheet viewer (part 2); row sign-offs as a trial Block (part 3); search inside documents (part 4) | Manuals on hand, fit-off and points lists readable on the phone and signed off as you go, finding the right page by searching | Sharing libraries with subcontractors; OCR, product scanning and the product catalogue (later) |
| **5c. Assets** (after 4c) (`assets`) | Tools and gear with QR tags, check out and in, faults and Do-not-use, inspections and test & tag due dates, vehicles with servicing by km and date | Test-and-tag reminders, knowing who has the gear, van servicing on time | Fleet-wide assets, public lost-and-found QR |
| **6. Offline sync, notifications, email** | Full offline, push, own SMTP | Works in plant rooms and basements | Team notifications and approvals |
| **7. Teams** | Members screen, invites, roles in use (including the built-in **Apprentice** role with a year, see below), My work across people, onboarding inductions; **check in / out and Who's where** (`attendance`), **leave requests and the leave calendar** (`leave`), see "Phase 7: check-in, Who's where and leave" | — | Foremen, apprentices, per-project roles; timesheets built on check-ins |
| **8. Multi-company projects** (stage 2b proper) | Contract chain, company invites, site/project QR access, placement, managed sites, project listing | — | Builders hosting jobs, subcontractors under them |
| **9. Inductions & credentials** | Site/company/project/area inductions, the rest of the wallet (inductions in it, sharing, requirements), compliance, employment details | — | Builder inductions, chain inductions, induction builder later |
| **10+.** | RFIs, revision requests, variations, SWMS & forms, reports, hosted site & federation; Documents later parts: OCR for scanned documents, product barcode scanning, the product catalogue, product notes, installed products on plans (`documents-block.md` build order 5–9) | | |

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
- **Join links (decided Nov 2026).** Every invite has a private join link, `/join/<token>`, that whoever invites (`companies.members.invite`) can copy or share by hand: shown straight after inviting and under **Invite link** on Members, with **Make a new link** (the old one stops working). It's how people get in when the server has no email. The link works for 14 days and once; the token is stored hashed (to find it) and encrypted (so the link can be shown again), on `Membership`.
  - Someone new to Grid opens it, types their name and a password, and is signed in and in the business (`POST /api/session/join`).
  - Someone who already uses Grid (has a password, or is in another business on this server) signs in first and comes back to one **Join** button, so a link alone can never open another business's account.
  - Signed in as someone else: it says who the invite is for, with Sign out.
- Settings: `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`, `TRUSTED_ORIGINS`, `SIGNUP_MODE` (Unraid template). The email server is set in the app: Settings › Email (server admin), with provider presets and a test button.
- **Address suggestions from Google (decided Nov 2026).** Address boxes (new job, new site, clients, quotes, upload a quote, branding) are `AddressField` from `@grid/ui`: as you type, real addresses are suggested; picking one fills in the whole address ("…, Australia" dropped on an Australian server). The server admin turns it on in **Settings › Maps** with a Google Maps API key (Places API (New)), stored encrypted in `ServerSetting` like the email password, with a Test button and a country (default `au`). Browsers never see the key: they ask `/api/places/autocomplete` and `/api/places/details`, which ask Google (`apps/web/src/lib/places.ts`), using session tokens so one address typed and picked is billed as one session. With no key, or if Google fails, the box is a plain text box. Shows "Powered by Google" under suggestions (Google's terms). The picked place's location comes back too (`onPick`), ready for site geofences later; nothing stores it yet. **Your sites first (decided Nov 2026):** with `sites`, the box also suggests your business's sites (active and archived, by name, address or client) in a **Your sites** group above the Google **Addresses** group, each loading on its own. Picking a site fills in its address and calls `onSite`: New job switches to a precinct or centre site (so its buildings and levels can be ticked; a house's address is enough), New quote and Upload a quote set the site picker, and New site opens the existing site instead of making a second one. Without permission to see sites, only addresses show.
- **Activity log (decided Nov 2026).** Every audit entry also records the **IP address and device** of the request that made it (`AuditLog.ip`, `userAgent`). The app sets this once (`setAuditOrigin` in `apps/web/src/blocks.tsx`, from `lib/request-origin.ts`: Cloudflare's CF-Connecting-IP, else the first X-Forwarded-For), so Blocks call `audit()` as before; background work has none. **Settings › Activity** (`/business/activity`, permission `companies.activity.view`, Owner only by default) lists the business's changes newest first by day, with a Who filter, plain-English lines ("Deleted a site note “Lockbox”", `blocks/companies/activity-words.ts`), the device and IP, and the recorded details on tap. Your own account changes (no business) show to you too. Entries from before this have no device.
- **Changing your email (decided Nov 2026):** anyone, the Owner included, changes their own sign-in email in Settings › Profile › Change email, confirming with their current password (people without one set a password first). Refused if another account uses the address. The old address gets a "your email was changed" email when the server has email set up; the change is in the audit log. It's `POST /api/session/email` in the app, not Better Auth's change-email (that needs email verification and hides a taken address). Changing someone else's email comes with the team screens.
- **Ways to sign in:** email and password, plus a **sign-in link by email**, which is handy on a phone on site.
  - Passkeys (Face ID / fingerprint) come after.
  - Google / Microsoft sign-in is optional and switched on per server.
- **Sessions:** long-lived on the person's own phone or tablet, so nobody signs in every morning. A server admin can see and revoke devices.
- **Self-hosted:** invite-only (`deployment-modes.md`). The first account on a fresh server becomes the server admin.
- **Hosted (later):** open sign-up uses the same setup, and federation identity builds on it.
- **Sign-in emails:** sign-in and verification emails stay platform-controlled (`templates-block.md`). They use the server's SMTP settings, or a console log in development.



### "Just me" setup

- Sign-up asks two things: **trade** and **"Just me" or "With a team"**. The trade is a grouped drop-down of about 65 Australian trades (`blocks/companies/trades.ts`, decided Nov 2026: Electrical & communications, Fire, Mechanical & plumbing, Building, Structure & civil, Outside & finishing, Professional & services, Something else). Each borrows the starting preset of the closest original trade. `Company.tradeProfile` is text, so adding a trade needs no migration; never rename or remove an id in use.
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

## Phase 4c: trade icons and take-offs (planned, decided Nov 2026)

Built after 5b (Documents) and before 5c (Assets). Trade symbols placed on plans, counted, and turned into quote lines. Also links a manual to an icon type, so tapping a placed icon offers its documents (moved here from Documents, `documents-block.md` build order step 6).

**The icon library**
- **Every trade, from the start:** Electrical, Data & comms, Plumbing, HVAC, Fire, Security, Gas and Solar, plus **Custom** for the business's own icons. No trade is switched off; the layout below keeps the list quick to get through.
- **Grouped by trade, each group an accordion.** Tap a trade's heading to close it and skip past it. Grid remembers which groups you've closed (per person, on that device).
- **Search bar at the top** of the library. Searches icon names and other words for them ("power point" finds GPO) across every trade, closed groups included. While searching, only the groups with matches show, opened; clearing the search puts the groups back as they were.
- **Icons:** simple, original line symbols that read clearly at small sizes. Each has a key (`electrical.gpo-double`), a name ("Double GPO"), a trade and search words. Built-in icons live in code; custom icons are stored per business (`CustomIcon`).

**Placing and counting**
- In the plan viewer's markup tools: pick an icon, then tap the plan to place it. It stays picked so you can tap 20 GPOs in a row.
- A placed icon is a markup (`PlanMarkup.kind = ICON` with `iconKey`), so it has the same visibility, undo, delete and Recently deleted as other markups.
- Each trade's icons sit on their own layer that can be shown or hidden, ready for several trades sharing one set of plans (phase 8).
- **Counts** per icon for the sheet, the level and the whole job, in a panel beside the plan.

**Numbered versions of an icon (decided Nov 2026)**
- The same symbol can stand for different things on a job: **DGPO 1** a standard double power point, **DGPO 2** an expensive one. Each number is its own version, with its own price book item.
- **Set per job only.** Each job sets up its own numbers; nothing carries over from other jobs or the business. On the same job, the plans and the quote share them (a Quoting job's numbers carry on when it's won).
- **Placing:** after picking an icon, a row of chips shows its numbers for this job (**1 · 2 · 3 · +**). The picked number is used for every icon you place until you change it. An icon with only one version shows no chips and no number.
- **On the plan:** each placed icon shows its number small beside the symbol, so two versions can't be confused.
- **Each number has** a price book item (later an assembly) and an optional short name ("Standard", "Iconic", "Weatherproof") shown on the chips and in the counts. **+** adds the next number and asks for its item; it can also be set up from the quote's Take-off section.
- **Counts split by number** (DGPO 1 × 38, DGPO 2 × 4), and each becomes its own quote line.
- **Changing a placed icon's number:** select one or more placed icons and switch them to another number; counts and the take-off follow.
- A number can't be removed while icons on the plans use it.

**Take-offs into quotes** (`docs/quotations-block.md` §3, "Take-off from plans")
- On a quote, **Take-off** opens the job's plans. A quote that isn't for a job yet gets a **Quoting job** (`docs/stage-2-projects.md`, "Quoting jobs"), so plans can be uploaded before the work is won.
- Back on the quote, the **Take-off** section lists the counts by icon and number. Each number links to a price book item (later an assembly) for this job. A number with no item yet shows **Pick an item** before it can be added. **Add to quote** turns the counts into lines; measured lengths come in as metres the same way.
- When a new plan revision changes the counts, the quote shows "Take-off changed" with the differences, and you choose to update or keep.
- When the quote is won, the Quoting job becomes the real job, so the plans and every placed icon are already there for the install.

**Data (sketch):** `PlanMarkup` gains `ICON`, `iconKey` and `iconNumber`; `CustomIcon` (`companyId`, `trade`, `name`, `keywords`, `fileId`, soft delete); `JobIconVersion` (`companyId`, `projectId`, `iconKey`, `number`, `name?`, `priceItemId?`, `assemblyId?`, unique on project + icon + number); `ProjectStatus` gains `QUOTING` and `NOT_WON`; quote lines remember their take-off source (sheet, revision, icon, level).

## Phase 5a: my tickets & licences (done, Nov 2026)

**What 5a built:** the `credentials` Block (core, pages at `/wallet`, API `/api/credentials`): **Settings › You › Wallet** (called "My tickets & licences" until Nov 2026; `/tickets` redirects). Add, change or renew (new expiry date and photo), delete. Each ticket: type from `TICKET_TYPES` (`blocks/credentials/types.ts`) or Other with a name, class or details ("A-grade"), number (encrypted), issued by (with a hint per type), issued and expiry dates or "It doesn't expire", front and back photos (taken or picked on the phone), notes. The list puts expired first, then the soonest to run out, with a Current / Expiring soon / Expired badge and "Expires in 23 days". Home shows a card (panel slot `home.top`, new) when any are expired or expiring. The job `credentials.remind` runs at 7 am (block jobs can now have a `schedule`) and emails each person once per step (60, 30, 7 days, on the day: `Credential.remindedAt`, cleared when the date changes); without email set up it only goes to the log. Photos can only be opened by their owner (`canReadTicketFile`); a replaced or removed photo is deleted straight away, and a deleted ticket's record goes at the next storage clean-up ("Deleted ticket or licence"). Photos need a business picked (uploads belong to one); the ticket itself doesn't.

The plan it was built from:

The first part of the credentials wallet (`inductions-credentials.md` §2), moved ahead of Documents & assets so a sole trader has their own tickets on hand now. The rest of the wallet stays in phase 9.

- **What it holds:** tickets and licences: type (a list of common Australian ones, e.g. White Card, electrical licence (A-grade, REC), EWP (yellow card), working at heights, confined space, first aid and CPR, test & tag, asbestos awareness, driver's licence, Working with Children, or "Other" with a name), number (encrypted with `encryptSecret()`), issuing body or state, issued and expiry dates, photos of the front and back, notes.
- **It belongs to the person, not a business.** It's under **Settings › You › Wallet**, kept when they change or leave a business, and nobody else sees it yet: sharing with a business, the access log and site requirements come in phase 9. (So it's the one place scoped to the person, not `ctx.companyId`.)
- **Expiry:** each ticket shows Current, Expiring soon (within 60 days) or Expired; Home shows a card when one is expiring or expired. Reminder emails at 60, 30 and 7 days before (and on the day), from the scheduled-jobs runner, when the server has email set up. Phase 6 adds push.
- **Data:** `Credential` (`userId`, `type`, `name`, `numberEnc`, `issuer`, `issuedOn`, `expiresOn`, `frontFileId`, `backFileId`, `notes`, `remindedAt`, timestamps, soft delete). Files are `StoredFile`s only the owner can open. Built so phase 9 adds inductions, `CredentialShare` and the access log without moving anything.
- **Offline:** viewing your tickets offline (e.g. at a gate with no signal) comes with phase 6's offline sync; until then the page needs a connection.

## Deleting a business (built Nov 2026)

- **Who:** an Owner (permission `companies.business.delete`, Owners only by default), from the bottom of **Business details**; or the server admin, for any business, from **Settings › Accounts & devices**. Anyone but the last Owner can **Leave this business** there instead (hidden while solo).
- **Confirming:** the box shows what goes with it ("12 jobs, 3 quotes, 240 photos, 4 people", from each Block's `companyUsage`) and the Owner types the business's name.
- **Recently deleted first:** `Company.deletedAt` hides it straight away: nobody can open it, it leaves every business picker, and its join links and signing links stop. Owners see it under **Recently deleted** in the business picker (and on setup, if it was their only business) with **Restore**; the server admin restores from Accounts & devices. It is kept as long as Recently deleted keeps photos (Storage settings, 30 days by default).
- **Removed for good:** the nightly storage clean-up runs every Block's `purgeCompany` hook (dependent Blocks first), removes the business's files (not people's Wallet photos, which belong to the person), route codes and activity log, then its roles and memberships. The `Company` row stays with only its name and `purgedAt`, and the log gets one "removed for good" entry. In dry-run mode the history lists it and nothing goes.
- **Shared work:** a job another business is on is handed to that business, not deleted; a site another business uses is handed over too.
- **People:** members only lose that business. Accounts, Wallets and other businesses aren't touched. Someone left with no business goes to setup.

## Phase 7: check-in, Who's where and leave (planned, decided Nov 2026)

Both are **team features**: hidden while solo (`teamOnly`), appearing when the first worker joins. Two optional Blocks, so a business that doesn't want them leaves them off in the Store.

### Check in / out (`attendance` Block, depends on `projects`)

- **Why it's new:** Grid only remembers the last site, building and level each person *opened* (`UserSiteLocation`, behind Home's "On site now"). That changes whenever a page is opened, so it isn't a check-in and isn't used for this.
- **How people check in:**
  - Tap **Check in** on the job page, at the area they're in; or
  - scan the site QR (`navigation.md` §7a), then pick the job if there's more than one.
  - No location tracking. Grid is an installed web app and can't follow a phone in the background, and the owner chose not to record location at the tap either.
- **Checking out:**
  - Tap **Check out** (job page, or the centre button's Actions menu).
  - **Checking in to another job checks you out of the last one**, so a person is only ever in one place.
  - **Automatic end of day:** anyone still checked in at the business's **end-of-day time** (Settings › Attendance, default 6:00 pm, server time zone) is checked out then. It's marked "auto" so the Owner can see who forgot.
- **Centre button:** while checked in, a team member's button is **Actions** (`navigation.md` §5a). Check-in by tap counts the same as by QR.
- **Data:**
  - `CheckIn` holds companyId, userId, projectId, siteId, building and level, `inAt`, `outAt`, how they checked in (`TAP` | `QR`) and how they left (`TAP` | `SWITCH` | `AUTO` | `CORRECTED`). One open row per person. Rows are kept as the attendance history, and timesheets later build on them.
  - The Owner (or someone with `attendance.manage`) can correct a time. It's written to the activity log with before and after.
- **Permissions:** `attendance.checkin` (everyone but Viewer), `attendance.view` (Who's where; Owner, and Foreman by default), `attendance.manage` (corrections, settings; Owner).

### Who's where

- **Home card** for people with `attendance.view`, for example "On site now: 4 of 6", followed by each name and job. Tap through to the page.
- **Team › Who's where** page, grouped by site and job:
  - each person, the building and level, and "since 7:12 am";
  - then **Not checked in** and **On leave today** (from the `leave` Block through a panel slot, when it's on).
- Live enough: it refreshes when opened and every minute while open. No push.
- Tapping a name opens the **Check-in history** filtered to that person.

### Check-in history (two pages, added Nov 2026)

Both read the same `CheckIn` rows, kept for good (nothing is purged). Each row shows:
- the date, job and site, and the building and level;
- the in and out times, and how long;
- a badge for **Auto** (checked out at end of day: they forgot) and **Corrected** (a time was changed, with who changed it and the times before).

**My check-ins** (everyone with `attendance.checkin`, under **Settings › You**, shown when the Block is on and the business isn't solo):
- Your own history only, newest first, grouped by day with a day total ("7 h 45 m").
- Filter by month or by job.
- You can't change your own times. **Ask for a correction** sends the Owner a note with the right time, and they fix it.

**Check-in history** (`attendance.view`, under **Team**, next to Who's where):
- Everyone's history, filtered by person, job, and date range (This week, Last week, This month, or pick dates).
- Grouped by day, with each person's day total. Totals for the range, per person, are at the top.
- People with `attendance.manage` can correct a time from here (written to the activity log).
- **Export CSV** of what's shown (person, date, job, site, in, out, hours, auto, corrected), for payroll or a dispute.
- Day and week totals are plain sums of time checked in, not a timesheet. Breaks, overtime and pay rules belong to timesheets later.

### Leave (`leave` Block, depends on `companies`)

- **The form** (`leave.request`, everyone but Viewer):
  - **Type:** Annual, Personal/carer's, Compassionate, Long service, Parental, Community service, Unpaid, RDO, Other. Types are a list in code; businesses can't edit them yet.
  - **Dates:** from and to, with part days (morning, afternoon, or hours) on the first and last day.
  - **Note**, which is private to the person and approvers.
- **Dates only, no balances.** Grid doesn't work out accruals. Balances stay in payroll (Xero, MYOB).
- **Approval:** a request is **Pending** until the Owner, or someone with `leave.approve` (Foreman if the Owner allows it), approves or declines it with an optional reason. The person is notified either way.
  - The person can cancel their own pending request.
  - Approved leave can be cancelled by an approver, or by the person until it starts.
  - Written to the activity log.
- **Leave calendar** (`leave.calendar`, Owner and approvers):
  - a month view, with each person's leave as a bar in a colour per type; pending leave is striped;
  - a list view on a phone;
  - a filter by person or type.
  - Public holidays come later, by state.
- **Sharing with staff** is one business setting the Owner sets for everyone (Settings › Leave). Individuals can't opt out.
  - **Not shared** (default): staff see only their own leave.
  - **Shared, booked only:** staff see which days are taken ("2 people away"), with no names or types.
  - **Shared with names:** staff see who's away and when. The type and note stay private either way: they see "Away", not "Personal leave".
  - Pending requests are never shown to other staff, only approved leave.

### Upcoming leave alerts (added Nov 2026)

So whoever plans the work knows who's away before the day comes.

- **Who gets them:** anyone with the new permission `leave.notify` ("Hear about upcoming leave"). The Owner always has it, Foremen have it by default, and any role can be given it on Roles. Each person can turn the alerts off, or change the timing, under **Settings › You › Leave alerts**.
- **When:**
  - **Before it starts.** By default 1 week before and 1 day before. Each person picks any of: 2 weeks, 1 week, 3 days, 1 day.
  - **Weekly look-ahead.** Monday morning: everyone away this week and next. It's skipped if nobody is.
  - **When leave is approved** that starts within the alert window (for example, approved on Friday for Monday), so a late booking isn't missed. It doesn't go to the person who approved it.
  - **Pending and starting soon.** People with `leave.approve` are told when a request starting within 3 days still hasn't been answered.
- **What it says:**
  - "Sam: away Mon 8 – Fri 12 Dec (5 days)".
  - The jobs Sam was checked in to most in the last 2 weeks (from `attendance`, when it's on), so you know which work needs covering.
  - The leave type shows only to people with `leave.approve`; others see "away", the same privacy as the shared calendar.
  - Only approved leave, apart from the pending reminder above.
- **How it arrives:**
  - **Now:** an email, in the 7 am daily run (the same block job pattern as the Wallet reminders, `leave.remind`, `schedule: "0 7 * * *"`).
  - **Now:** a **Coming up** card on Home for `leave.notify` holders, showing leave in the next 14 days.
  - **Phase 6:** the same alerts in the app's notifications and as push.
  - Each alert is sent once. A sent-log table (`LeaveAlert`: leave id, person, which alert) stops repeats. A changed or cancelled leave sends a short update to anyone already told.

### Build order

1. `attendance`: check in/out, auto check-out, the Actions centre button for checked-in members, Who's where with the Home card, My check-ins and the Check-in history with CSV export.
2. `leave`: the form, approvals and notifications, the calendar, sharing, "On leave today" in Who's where, and upcoming leave alerts (email and the Home card now; in-app and push with phase 6).

## Phase 7: apprentices (planned, decided Nov 2026)

Two separate things, set by different people:

1. **Whether someone is an apprentice: set by the business.** **Apprentice** becomes a built-in role, alongside Owner, Foreman, Employee and Viewer (and Estimator, `quotations-block.md` §9), with an **apprenticeship year (1st, 2nd, 3rd, 4th)** on their membership. Only the Owner, or someone with `companies.members.manage` (a Foreman if the Owner allows it), can set or change it, on Members. The person can't set it themselves: it decides what they may do on site.
   - Add `APPRENTICE` to `SYSTEM_ROLES` (`packages/core/src/block.ts`), a display name in the companies block, and `grants.APPRENTICE` in each Block (default: about what an Employee gets). Add `apprenticeYear Int?` to `Membership` (only used with this role).
   - The year shows next to their name on Members and in people pickers ("Sam · Apprentice, 2nd year"), and is changed on Members (e.g. each anniversary). Grid doesn't move it on by itself.
   - Other features use it: inductions and forms aimed at "apprentices only" (`inductions-credentials.md` §2), and later, sign-offs and test results that need a licensed person (an apprentice's work shows as needing their supervisor's sign-off), and supervision on site.
   - Like every role, a business can copy it into a custom role and change it.
2. **Their apprenticeship details: entered by the apprentice.** Year, RTO, training contract and classification sit in the person's own private wallet (`inductions-credentials.md` §11), entered by them and shared only with their employer, only if they choose. The year the business sets (1) and the one in their wallet are separate: the business's is what Grid uses.

Related but separate: the **apprentice labour rate** in the price book (`quotations-block.md` §2) is a price, not a person.

## Later: AI features and a GPU (noted Nov 2026, not scheduled)

**Not needed now.** Nothing Grid's server does today uses a graphics card: plan PDFs are drawn by poppler (`pdftoppm`) and sharp, photos by sharp, quote and report PDFs by Chromium, plus PostgreSQL and Next.js, all on the processor. The plan viewer and markups already use the GPU of the phone or tablet (WebGL). For faster plan processing, more processor cores and RAM help, not a GPU.

**When it would matter:** if Grid gets AI features that run on the owner's own server, such as:
- reading sheet numbers and titles off scanned drawings (OCR), so plan uploads guess better;
- photo captions or tags, or spotting defects in site photos;
- searching manuals and documents by meaning, or summarising them (with phase 5b);
- quantities off plans for estimates (take-offs, quotations).

**Decide then:** run them locally (an Nvidia card passed through to a Grid AI container on Unraid: data stays in-house and there are no per-use fees, but the card and its power cost money) or through an online AI service (no hardware, pay per use, data leaves the server). Either way it would be its own optional Block, with any GPU settings in the Unraid template (`unraid/grid.xml`) and `docs/unraid.md`, and Grid must keep working without it.

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
