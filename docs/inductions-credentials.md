# Inductions & credentials block: agreed design

Status: **agreed, not built yet.** Block id `inductions`, depends on `companies`, `sites` and `projects`.
Build alongside stage 2 (Projects), because project access is checked against it. Shares the signing screen with SWMS sign-on (stage 9).

## Why inductions attach to the building, not the project

Building inductions renew yearly and outlive individual projects; works in the same building can span several projects and years. Tying inductions to projects would force people to redo a still-valid building induction for every new job.

## 1. Layers

| Layer | Set by | Applies to | Lasts |
|---|---|---|---|
| **Site** | Site owner company (e.g. Building Management) | Everyone working at the site, or at chosen buildings | Default 12 months, across every project at the site |
| **Company** | Any company (typically a builder's standard induction) | That company's people and everyone **below it in the chain**, on every project where it's in the chain | Set by the company (e.g. 12 months), reused across all its projects |
| **Project** | Any company in the project's chain | That company's people and everyone below it, on this project only | Until the project ends, or a set expiry |
| **Area** | Site owner (site-wide areas) or a company on the project (inside its Covers) | Anyone opening that building or level, within the owner's reach | As set |

- **Site:** the long-lived record from the `sites` block (`stage-2-projects.md` §1). The **building induction** lives here, is managed by the **site owner company**, renews (default yearly), and stays valid across every project at that site. If building management claims a site later, its induction moves with it. On sites with several buildings, it can apply to the whole site or to chosen buildings.
- **Company induction:** set up once in the company's induction library. The builder's standard induction is done once and counts on every job of theirs until it expires, so workers don't redo it per project. Project inductions then only cover what's specific to that job.
- **Project induction:** the job-specific briefing.
- **Area:** extra inductions for specific **buildings or levels** (zones later), e.g. roof plant room, live hospital ward, data hall.

### One reach rule for every company-owned induction

An induction owned by a company applies to **that company's people and every company below it in the contract chain** (`ProjectCompany.ancestorIds`).
- The **host** sits at the top, so its company and project inductions apply to everyone.
- A **subcontractor** (e.g. a mechanical contractor, or a sparky's employer) can add its own crew briefing. It applies only to its own people and its subs.
- Companies above it **see that it exists** and its completion status (the safety override), but **can't edit, remove or waive it**. Its owner can't apply it to companies above or beside it.
- If a company moves to a different parent (`stage-2-projects.md` §5), its reach is recalculated straight away.

### Audience: staff, subcontractors or both

Each company-owned induction (company, project or area) has an **audience**, applied inside its reach:

- **Everyone in our reach** (default): the owner's own people plus every company below it in the chain.
- **Our staff only:** the owner company's own workers.
- **Subcontractors only:** companies below the owner, not its own staff.

It can be narrowed further, combining any of these:
- **by role:** e.g. Foremen only, apprentices only (company roles, or per-project role overrides);
- **by trade:** e.g. electrical or mechanical subcontractors, from each company's trade profile;
- **by named company:** e.g. the crane-lift subcontractor;
- **by ticket:** only workers who hold, or are required to hold, a credential type, e.g. EWP operators get the boom-lift briefing.

Examples:
- A builder's **company** layer holds "Apex staff induction" (*Our staff only*) and "Apex subcontractor induction" (*Subcontractors only*).
- A hospital **project** adds a staff-only "Patient privacy" block and a subcontractor-only "Contractor sign-in & permits" block.

Who sees what:
- The worker's checklist only lists inductions whose audience includes them.
- Companies above see completion status for anything that applies on their projects (safety override).
- An induction aimed at **another company's own staff** is internal to that company. Companies above see neither its content nor its status.
- If someone's role, trade or tickets change, their checklist updates. Something they already completed stays on record.

### Joining the company (employee onboarding)

- A staff-only company induction can be marked **"Required when joining the company"**.
- It appears on the new starter's checklist straight after they accept their company invite, before they've opened any project.
- **Project access:** projects show the usual checklist until it's done, with onboarding items listed first, grouped as "Sparky Co (joining)".
- **Re-onboarding:** if someone leaves and rejoins later, onboarding is checked again against its validity period. Their old completions still count if not expired.
- **Foremen and Owners** see an onboarding progress list for new starters on the Members screen ("2 of 3 done").

### Access check when someone opens a project

1. Current **site** induction (or for the buildings in the project's Covers, if inductions are per building).
2. **Company** inductions from every company above the worker in the chain, plus the worker's own company (including "required when joining"), filtered by audience.
3. **Project** inductions from the same companies, filtered by audience.
4. **Area** inductions for the **level they're opening**: checked when they pick it in the breadcrumbs, not for every level the project covers, so nobody is blocked from Level 5 by a Level 3 ward induction they don't need yet.
5. Any required tickets (see §2).

- The checklist groups items by who set them ("Riverside Health Precinct", "Apex Construct", "Volt Fitouts"), so it's clear why each is needed.
- A company induction already done for that company shows as ✓ with its expiry date.
- The level picker and **Other work areas** show an "Induction" chip on levels that need one the person hasn't done.

## 2. The person's credentials wallet

Inductions and tickets **belong to the person, not the employer**. The wallet follows them between companies (and across servers once federation identity exists).

- Completed inductions: site, version, date, expiry, who delivered it.
- Tickets and licences: White Card, electrical licence, EWP, working at heights, confined space, first aid, etc. Card photo(s), issuing body, number, expiry.
- Projects or areas can **require** tickets, e.g. "EWP licence required for Level 5 façade works".

## 3. Completing an induction

- **Online:** video and/or documents → short quiz (pass mark) → signature on the phone. Can be done before arriving on site.
- **In person:** inductor records attendance; each person signs on a tablet.
- **Record:** induction version, quiz result, signature, date, deliverer.
- **New induction version:** owner chooses "everyone must redo" or "new starters only".

## 4. Expiry

- Reminders to the worker and their Foreman before expiry (default 30 and 7 days).
- On expiry the worker's project view drops back to the checklist, and the host is notified.

## 5. Privacy model

**Principle: the person owns their wallet; others see only what they share, for as long as they share it.** One exception, basic safety status, below.

### Two levels of information

- **Status:** e.g. "Building induction: valid until 14 Mar 2027", "EWP licence: valid ✔".
- **Details:** licence numbers, card photos, date of birth, issuing body. Sensitive; some are government identifiers.

**Default is status only. Details are never shown without the person's approval.**

### Sharing

- **Joining a project:** a clear notice lists what the site requires and who will see the **status** of each ("Host and builder will see whether each is valid"). Sharing status is a condition of working on site (the agreed safety override), and the person sees exactly what's shared before accepting.
- **Requests for details:** "Request to view" on a specific credential, with a **required reason**. The person approves or declines. Approvals are **time-limited**: one view, 7 days, or until the project ends.
- **Employer:** on joining a company the person chooses what it can see (e.g. status for all, details for licences). Changeable anytime.
- **Revoking:** immediate. Some requirements may then fail (e.g. a project needing a sighted EWP licence → back to the checklist).

### Audit

- **Every view of details is logged:** viewer, company, time, item, reason.
- **The person can see their own access log** in the wallet.
- Approvals, declines, revocations, uploads and edits are logged.
- Platform admins can't view card details through support access without the person's approval; if approved, it's logged and the person is notified.

### Verification without copies

- A Foreman/inductor can tap **"Sighted original"**. The site keeps "EWP licence sighted by Priya on 16 Oct 2026, valid to 2028", with **no image or number stored on the site's side**.

### Security

- Card photos and licence numbers **encrypted at rest** (same key approach as SMTP secrets).
- Images served only through **short-lived signed links**; shared views carry a **watermark with the viewer's name**.
- When a credential is replaced, the old photo is deleted after a grace period.

### After leaving

- Leaving a company or a project ending ends that party's wallet access.
- Their own **status records stay** (sites must keep safety records), e.g. "completed building induction 1 Feb 2026" or "licence sighted valid on …", never copies of cards.

### Compliance note

Collect only what's needed, with consent, a stated purpose, access logs and revocation, consistent with the Australian Privacy Principles. Get the final design reviewed before running it as a hosted service handling other companies' staff data.

## 6. Who sees what

| Viewer | Sees |
|---|---|
| Host and main contractor | Everyone's induction/ticket **status** on their site, at any depth in the chain |
| Worker's own company | What the worker chose to share with their employer |
| Anyone else on the project | Nothing, unless the worker shares |
| The worker | Everything, plus the access log |

## 7. Permissions

- `inductions.complete`: do inductions, manage own wallet (everyone)
- `inductions.deliver`: run in-person inductions, mark "sighted original"
- `inductions.manage`: create/edit your company's inductions (company library, project and area inductions on projects you're on, site inductions on sites you own), quizzes, versions and requirements. It never covers another company's inductions.
- `inductions.status.view`: see status for people on your sites/projects
- `inductions.details.request`: request to view details (still needs the person's approval)

## 8. Menus

- `settings.user`: "My credentials" (wallet + access log)
- `project.tabs`: "Inductions" (requirements + who's complete, grouped by the company that set each one)
- `settings.company`: "Induction library" (the company's own company-wide inductions and reusable templates)
- `home.widgets`: "Inductions to complete" and "Expiring soon"
- Site page (`sites` block): an "Inductions" button with a "1 to do" chip, and site-level induction setup for the site owner

## 9. Data model sketch

- `Site`, `Building`, `Level`: from the `sites` block (`stage-2-projects.md` data model). `Project.siteId` links projects to a site.
- `Induction`: `scope` (`SITE | COMPANY | PROJECT | AREA`), `ownerCompanyId` (site owner, or the company in the chain that set it), `siteId?`, `projectId?`, `buildingIds String[]` (empty = whole site), `levelId?` (area inductions on a level; `zoneId?` later), `title`, `validityMonths?`, `currentVersionId`, `archivedAt?`.
  - Reach is computed, not stored: a COMPANY/PROJECT/AREA induction applies to the owner's people and to `ProjectCompany` rows whose `ancestorIds` include the owner.
  - A completion of a COMPANY induction counts on every project until it expires.
  - `audience` (`REACH | STAFF | SUBCONTRACTORS`), `audienceRoles String[]`, `audienceTrades String[]`, `audienceCompanyIds String[]`, `audienceCredentialTypes String[]` (all empty = no narrowing), `requiredOnJoin Boolean` (STAFF company inductions only).
- `InductionVersion`: `inductionId`, `content` (video/doc keys now; builder blocks later, see §13), `quiz Json`, `passMark`, `redoPolicy` (`ALL | NEW_ONLY`), `publishedAt`.
- `InductionCompletion`: `userId`, `versionId`, `method` (`ONLINE | IN_PERSON`), `score`, `signatureKey`, `deliveredById?`, `completedAt`, `expiresAt`.
- `Credential`: `userId`, `type`, `issuer`, `numberEnc`, `photoKeysEnc`, `issuedAt`, `expiresAt`, `deletedAt`.
- `CredentialRequirement`: `scope` + target id, `credentialType`, `mustBeSighted`.
- `CredentialShare`: `userId`, `credentialId?` (null = all), `granteeCompanyId`, `level` (`STATUS | DETAILS`), `expiresAt?`, `revokedAt?`.
- `CredentialAccessRequest`: `credentialId`, `requesterUserId`, `requesterCompanyId`, `reason`, `status`, `decidedAt`, `grantExpiresAt`.
- `CredentialAccessLog`: `credentialId`, `viewerUserId`, `viewerCompanyId`, `item`, `reason`, `at`.
- `CredentialSighting`: `credentialType`, `userId`, `siteId?`/`projectId?`, `sightedById`, `validTo`, `at` (no number or image).

## 10. Build order

1. Induction definitions (site/company/project/area, using `sites` buildings and levels) with the chain reach rule and audience (staff / subcontractors / both); company induction library; online completion with quiz and signature.
1a. "Required when joining the company" onboarding, and onboarding progress on the Members screen.
2. Access checklist gating project view.
3. Credentials wallet (status only), requirements, expiry reminders.
4. Details sharing: requests, approvals, time limits, access log, watermarking.
5. In-person delivery and "sighted original".
6. Versioning and redo policies.
7. (Later) Induction builder (§13).

## 11. Personal employment details (wallet section, employer only)

Employment and payroll-related industry details. **Different audience and higher sensitivity than safety credentials**, so stricter rules.

**What it holds (all optional, entered by the person):**
- **Portable long service leave:** scheme (e.g. CoINVEST in Vic, QLeave in Qld, Long Service Corporation in NSW) and worker number; the person can record service history across employers.
- **Superannuation:** fund name, USI, member number.
- **Industry redundancy / income protection funds** (e.g. Incolink in Vic): fund and member number.
- **Award/agreement classification and apprenticeship details** (year, RTO, training contract), if the person chooses.

**Rules:**
- **Only ever shared with the person's employer.** Never with hosts, builders, other companies on a project, platform admins (without explicit approval), and never usable as a site/project requirement.
- The person chooses per employer whether to share, and can revoke at any time.
- Every view is audit-logged and visible in the person's access log (same as §5).
- Numbers encrypted at rest.
- Onboarding shortcut: a new employer receives these in one tap, with consent, instead of paper forms.

**Deliberately not stored:**
- **Tax file numbers:** strict legal limits on collecting and keeping TFNs; payroll software handles them.
- **Bank account details:** payroll's job, and a high-value target in a breach.
- **Union membership:** sensitive information under the Privacy Act. Not collected. (If ever added: optional, private to the person only, never shared.)

**Data model:**
- `EmploymentDetail`: `userId`, `kind` (`PORTABLE_LSL | SUPER | REDUNDANCY_FUND | INCOME_PROTECTION | CLASSIFICATION | APPRENTICESHIP | OTHER`), `provider`, `numberEnc`, `extra Json` (encrypted where sensitive), `updatedAt`.
- `EmploymentShare`: `userId`, `employerCompanyId`, `kinds String[]`, `grantedAt`, `revokedAt?`. Only valid where the user has an ACTIVE membership in that company; ends automatically when the membership ends.
- Views logged to `CredentialAccessLog` with `item = employment:<kind>`.

**Permission:** `inductions.employment.view`: employer-side permission (default Owner; grantable to e.g. an Admin/Payroll role). Still requires the person's share.

## 12. Company compliance (company-level, shared up the chain)

What builders usually need from subcontractors is **proof at company level**, not a worker's personal fund details.

**Compliance items (held by the company):**
- Public liability insurance: certificate of currency, insurer, cover amount, expiry.
- Workers' compensation: certificate of currency, expiry.
- Portable LSL **employer** registration (e.g. CoINVEST employer number).
- **Subcontractor statements**: declarations that wages, super and workers' comp for the period have been paid (period, signed by, date).
- Contractor/trade licences held by the company (e.g. electrical contractor licence).
- Other: professional indemnity, vehicle insurance, quality/safety accreditations.

Each item: document (via Documents block storage), details, issue and **expiry date**, reminders before expiry (default 30 and 7 days) to the company's Owners.

**Sharing:**
- On a project, compliance is shared with the company's **parent in the contract chain** (the company that engaged it), and the host/main contractor may see **status** (current / expiring / expired) for every company on site.
- With **connected companies** (documents-block connections), share per item.
- Pricing never appears in compliance items.

**Requirements and the stage 2 invite flow:**
- A host or parent company can set **required compliance items** for a project or for a specific invite (e.g. "Public liability ≥ $20M, workers' comp current, electrical contractor licence").
- When inviting a company (stage 2 §2) or placing one in the chain (§4), the invite shows the requirements. The invited company attaches or picks existing items when accepting.
- Until requirements are met, the company's status on the project is **"Compliance pending"**: its people get site basics only (same as a pending placement).
- If an item **expires mid-project**: reminders first, then the company drops to "Compliance pending" and the parent and host are notified. A parent can grant a time-limited **override** with a reason (audit-logged).
- Subcontractor statements can be requested **per period** (e.g. monthly or per progress claim) and tracked as received/outstanding; useful later for variations and claims.

**Data model:**
- `ComplianceItem`: `companyId`, `kind`, `details Json`, `documentId?`, `issuedAt`, `expiresAt?`, `status` (derived), `deletedAt`.
- `ComplianceRequirement`: `projectId` or `projectCompanyId` (invite-specific), `kind`, `rules Json` (e.g. minimum cover), `setByCompanyId`.
- `ComplianceSubmission`: `requirementId`, `itemId`, `projectCompanyId`, `status` (`PENDING | ACCEPTED | REJECTED | EXPIRED`), `reviewedById`, `note`.
- `ComplianceOverride`: `projectCompanyId`, `requirementId`, `grantedById`, `reason`, `expiresAt`.
- `SubcontractorStatement`: `projectCompanyId`, `periodStart`, `periodEnd`, `documentId`, `signedBy`, `submittedAt`, `status`.

**Permissions:**
- `companies.compliance.manage`: upload/edit compliance items (Owner default)
- `projects.compliance.require`: set requirements on projects/invites (host and parent companies)
- `projects.compliance.review`: accept/reject submissions, grant overrides

**Build order additions:**
7. Company compliance items + expiry reminders (can ship with company connections).
8. Requirements wired into stage 2 invites and placement ("Compliance pending").
9. Subcontractor statements per period.
10. Personal employment details + employer-only sharing.

## 13. Induction builder (later)

Status: **planned for later.** Until then, inductions are a video and/or uploaded documents plus a simple multiple-choice quiz.

A drag-and-drop editor for building inductions inside the app, so companies don't need outside tools or long PDFs.

### Content blocks (one induction = a series of short pages)

- **Text** with headings and callouts: Warning, Hazard, Must do, Must not.
- **Image** and **photo** (e.g. the gate, the sign-in board), with captions.
- **Video**, with an optional "must watch to the end" rule.
- **PDF page** from the documents block, e.g. one page of the site safety plan.
- **Site map / plan:** a level from the project's plans with pins for assembly points, first aid, fire extinguishers, amenities and restricted zones.
- **Contacts:** pulled live from the site and project (site manager, first aider, emergency numbers), so they never go out of date.
- **Acknowledgement:** "I understand …" tick boxes that must be ticked to continue.
- **Signature** (shared signing screen with SWMS sign-on and quotes).

### Questions

- Multiple choice and true/false.
- **Tap the spot** on an image or plan ("Tap the emergency assembly point").
- **Put in order** ("Steps before isolating a circuit").
- Settings per induction: pass mark, shuffle questions and answers, retries allowed, and whether wrong answers show the correct one.

### Making and reusing

- **Template library:** a few starters ("Standard builder induction", "Live hospital environment", "Domestic job safety"), plus the company's own induction library.
- **Reusable sections:** e.g. the company's PPE section, kept in one place and used in several inductions. Editing it updates them all at the next version.
- **Languages:** an induction can have translated versions. The worker picks their language, and the record notes which one they did.
- **Preview as a worker** on a phone frame before publishing.
- **Publishing:** creates a new version with the usual redo policy ("everyone redoes" or "new starters only").

### Reporting

- Completion and pass rates per induction and per company.
- **Most-missed questions**, so unclear content can be fixed.
- Average time taken.

### Build notes

- Reuse the templates block's block editor engine (`templates-block.md`), with induction-specific blocks registered by the `inductions` block.
- `InductionVersion.content` becomes block JSON, and `quiz Json` moves into question blocks. Existing video/document inductions convert to a single "Video" or "PDF" block.
- Completions record which language and which block version were shown.

