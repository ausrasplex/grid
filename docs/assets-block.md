# Assets block: agreed design

Status: **parts 1–5 built (Nov 2026); vehicles (§11) and the public tag page (§10) next.** Block id `assets`, depends on `companies`.
Uses `projects` (stage 2) for site locations when switched on, and stage 6 notifications for alerts; the core works without them.
Suggested placement: alongside stage 3b (Documents).

## Purpose

Companies track their gear (tools, lockboxes, ladders, harnesses, generators, test equipment, vans) across projects, and employees can report faults. Owners and Foremen are alerted with what's wrong, where the asset is, who reported it and when.

## 1. Assets

- Fields: name, category, make, model, serial number, purchase date, photo(s), notes, custom fields per category.
- **Status:** `IN_SERVICE | FAULTY | OUT_OF_SERVICE | IN_REPAIR | RETIRED | LOST`.
- **Categories** per company. The trade preset suggests a starting set, e.g. Electrical: Power tools, Test equipment, Leads & RCDs, Ladders, Lockboxes.
- **Asset tags:** the app generates a QR code per asset and prints sticker sheets (PDF). Scanning opens the asset directly, using the same scanner as the site QR code and document product scan. Existing barcode tags can be linked instead.
- Assets are private to the owning company. Other companies on a project never see them.

## 2. Location and custody

- **Check out / check in:** scan the tag and choose "I've got it" or "Assign to [person] on [project / building / level]".
- Custody targets: company yard/store, a project (and a building or level of its site), a person, a vehicle.
- **Movement history** on every asset (from → to, who, when).
- **Project view:** each project shows the company's assets currently on that site.
- **Not seen recently:** flag assets not scanned or moved for N days (default 30, set per company).

## 2a. Actions group (asset screen)

The asset screen has an **Actions** group with three buttons: **Return**, **Fault** and **Lost**. The buttons use short labels because the group heading already makes them actions. The sheets they open keep the full wording as their title ("Report a fault", "Report lost or stolen"). The same three are on the tag-scan screen and the asset row's swipe menu.

- **First button** changes with the asset's state. Fault and Lost are always the same.

  | Asset state | First button |
  |---|---|
  | Available | **Check out**: to you, or to a van or site location. Shown as the main (filled) button |
  | Checked out to you | **Return**: checks it in to the workshop, a van or a site location |
  | Checked out to someone else | **Take over**: moves it to you, and the previous holder is notified |
  | Do not use / in repair | **Check out**, greyed out, with "Do not use: fault reported" underneath |
  | Reported lost or stolen | **Recovered**: clears the flag and checks it in wherever it is now |

  The button is the verb "Check out" (two words); "checkout" is only used as a noun.
- **Fault:** opens the fault sheet (§3).
- **Lost:** opens the lost sheet (§3a). Its confirm button follows the choice: **Mark as lost** or **Mark as stolen**.

## 3. Fault reporting

1. Scan the tag (or search) → **Fault**.
2. Type: `FAULTY | DAMAGED | MISSING_PARTS | FAILED_TEST | OTHER`, plus a note and photos. Lost and stolen have their own action (§3a).
3. **Do not use** toggle for anything unsafe → the asset immediately becomes `OUT_OF_SERVICE`, and anyone who scans it sees a red warning banner.
4. Recorded automatically: **reporter, time, location** (current project/level from custody, plus GPS if the user allows).
5. **Owners and Foremen are notified** (push + inbox). Do-not-use reports are **urgent** and ignore quiet hours.
6. Workflow: `REPORTED → ACKNOWLEDGED → IN_REPAIR → FIXED` (or `RETIRED`), with a note, a person and a time on every step. FIXED returns the asset to `IN_SERVICE`.
7. Full fault history stays on the asset.

- Works offline: the report queues in the outbox, and the Do-not-use banner applies locally straight away.
- Duplicate guard: if an open fault exists, offer "Add to existing report" instead of a new one.

## 3a. Lost or stolen

1. **Lost** from the Actions group. Anyone in the company can report it; usually it's the person who had it checked out, or a Foreman doing a van check.
2. **Last known whereabouts** are filled in from the last check-out or scan (e.g. "With Sam T., ED Refurbish, Tower B L5, Tue 7:02am"). The reporter can correct them and add a note.
3. Choose **Lost** or **Stolen**:
   - **Lost:** the public tag page says "reported lost" and asks finders to report it (§10).
   - **Stolen:** the tag page looks normal, and the owner is alerted silently on any scan. An optional police report number can be recorded for insurance.
4. Status becomes `LOST`. Owners and Foremen are notified straight away, and the asset gets a **Lost** chip at the top of "Needs attention".
5. Sightings are added to the asset as they come in.
   - **Mark recovered** clears Lost and checks the asset in to wherever it is now.
   - **Retire as lost** (Owner only) removes it from the active list but keeps its history and tag record, so a later scan is still recognised.
6. **Nudge (optional):** if a checked-out item isn't returned or scanned within N days, the holder is asked "Do you still have Asset No. 1234?". Answering "No" opens the Lost sheet.

## 4. Inspections and due dates

- **Rules per category:** e.g. test & tag interval for electrical equipment, ladder inspection, harness inspection, lifting gear. Interval in days or months, set per company.
- Record result: pass/fail, tester, date, next due date, optional certificate (kept on the check itself; see "What part 4 built").
- **Reminders** before due (e.g. 14 days), and a daily digest of what's due.
- **Overdue assets are flagged as not to be used**, with a banner on scan, until a passing inspection is recorded.
- A failed inspection creates a fault automatically (type `FAILED_TEST`, do not use).

## 5. Permissions

- `assets.view`: see assets, scan, view history
- `assets.custody`: check out / check in for yourself
- `assets.assign`: assign to others and move between sites
- `assets.faults.report`
- `assets.faults.manage`: acknowledge, repair, close
- `assets.inspections.record`
- `assets.manage`: add, edit, retire assets; categories; inspection rules; print tags

Default grants: Employee: view, custody, faults.report. Foreman: plus assign, faults.manage, inspections.record. Owner: all.

## 6. Menus

- `sidebar.main`: "Assets" (icon `hardhat` or a new `wrench` icon)
- `header.actions`: scan button (shared scanner)
- `home.widgets`: "Faults to action" and "Due for inspection"
- `project.tabs`: "Assets on site" (when projects is on)
- `settings.company`: "Asset categories & inspections"

## 7. Events and notifications

Emits:

- `assets.fault.reported` (urgent flag when do-not-use)
- `assets.fault.updated`
- `assets.inspection.due`
- `assets.inspection.overdue`
- `assets.not_seen`
- `assets.moved`

Notification types: fault reported (to Owners/Foremen), fault resolved (to reporter), inspection due/overdue, not seen.

## 8. Data model sketch

- `AssetCategory`: `companyId`, `name`, `fields Json`, `inspectionIntervalDays`, `inspectionType`.
- `Asset`: `companyId`, `categoryId`, `name`, `make`, `model`, `serial`, `tagCode` (unique), `status`, `photoKeys String[]`, `nextInspectionDue`, `lastSeenAt`, `deletedAt`.
- `AssetCustody`: `assetId`, `holderType` (`STORE | PROJECT | USER | VEHICLE`), `userId?`, `projectId?`, `siteId?`, `buildingId?`, `levelId?`, `vehicleLabel?`, `fromAt`, `toAt`, `byUserId`.
- `AssetFault`: `assetId`, `type`, `doNotUse`, `note`, `photoKeys`, `status`, `reportedById`, `reportedAt`, `projectId?`, `siteId?`, `buildingId?`, `levelId?`, `lat?`, `lng?`.
- `AssetFaultEvent`: `faultId`, `status`, `note`, `byUserId`, `at`.
- `AssetInspection`: `assetId`, `type`, `result`, `testerName`, `testedById?`, `testedAt`, `nextDue`, `certificateDocId?`.

All tables get UUIDs, `updatedAt` and soft delete, following the sync conventions.

## 9. Build order

1. Assets, categories, QR tags, scan to open.
2. Custody: check out/in, movement history.
3. Fault reporting + Do-not-use + workflow.
4. Inspections and due dates.
5. Project tab, not-seen alerts, home widgets. (Built: see "What part 5 built".)

## 10. Public QR lookup and lost-and-found (anyone can scan)

Tags are web links on a permanent tag domain (see `deployment-modes.md` §1), so **any phone camera** opens them, including people from companies not on the app.

**Public page (no sign-in):**
- Item name/category and friendly number, e.g. "Makita 18V drill, Asset No. 1234".
- "Owned by Sparky Co Electrical".
- Whether it's reported **lost**.
- An **"I've found this"** button.
- Never shown: who holds it, where it's been, history, or anyone's contact details.

**When a lost asset is scanned:**
- **Finder signed in to the app:** prompt "This is reported lost. Let the owner know where you found it?" With consent, the owner's Owners/Foremen get:
  > **Asset No. 1234 found** at Project A, Building B, Level 3. Scanned by Jordan (Company X), 10:42am.

  Location comes from the project/level the finder is signed in to, plus GPS if allowed.
- **Finder not on the app:** "Report found" form with an optional note and optional shared phone location → "Asset No. 1234 found near [suburb]".
- **Relay messaging:** the owner can reply through the app ("Can you leave it at the site office?"); the finder chooses whether to share their own details.
- Every sighting is stored on the asset (when, where, by whom if shared). The owner can mark it **Recovered** in one tap.

**Company settings:**
- Public lookup on/off.
- Show "Lost" publicly, or **alert silently** (for stolen gear: the page looks normal while the owner gets the sighting).
- What the public page shows (item name, or just "Property of Sparky Co").

**Privacy and abuse:**
- The finder's location is only shared with consent, every time.
- Scans of assets that aren't lost notify no one and record no scanner.
- Rate limits on scans and reports; spam reports can be blocked.

**Across servers:** on a self-hosted server this works for every company on that server, and the public page works for anyone. Once federation Phase A is on, scans resolve through the hub to whichever server owns the tag.

**Data model additions:**
- `Asset.tagCode`: globally unique (instance prefix + random), separate from the friendly number `Asset.number`.
- `AssetSighting`: `assetId`, `reportedAt`, `finderUserId?`, `finderCompanyName?`, `projectLabel?`, `lat?`, `lng?`, `suburb?`, `note`, `consentShared`.
- `AssetMessage`: `assetId`, `sightingId`, `fromOwner`, `body`, `at` (relay thread).
- Company settings: `publicLookup`, `showLostPublicly`, `publicFields`.

## 11. Vehicles

A vehicle is an asset in a built-in **Vehicle** category. Faults, custody, QR tags, documents and reminders all work as above; this section adds what cars need, mainly servicing by **distance as well as date**.

**Reused as-is:**
- **Faults:** e.g. "Check engine light on", "Cracked windscreen", with photos; Do-not-use for anything unsafe; Owners/Foremen alerted.
- **Custody = driver assignment.** The history answers "who was driving on 3 March?" for speeding, toll and parking notices.
- **QR tag** on the windscreen or in the glovebox: scan to view, report a fault or log a check.
- **Documents block:** rego papers, insurance certificates, service invoices.

**Vehicle fields:**
- rego number, VIN, make, model, year, fuel type, assigned driver;
- fuel card (last digits only, never the full number), tyre sizes, notes.

**Odometer:**
- Readings logged at check-out/check-in, at services, or anytime from the phone.
- Readings that go backwards are flagged for review rather than rejected.

**Service schedule:**
- Rule per vehicle or category: every N months **or** N km, whichever comes first (e.g. 12 months / 15,000 km).
- The app estimates the due date from average km per day, with reminders before and an "Overdue" flag after.

**Service logbook:**
- Each entry: date, odometer, workshop, work done, parts, cost, invoice (document), next service due (date and km).
- Builds a full vehicle history for resale and warranty claims.

**Renewals with reminders:**
- Registration, insurance, roadworthy where needed, equipment certification (e.g. tow bar, crane, tray rated loads).

**Daily pre-start check:**
- Short checklist: tyres, lights, fluids, damage, plus custom items.
- A failed item creates a fault automatically (Do-not-use if marked critical).
- Simple fixed checklist lives in Assets; stage 9 Forms makes it fully customisable.

**Running costs (Owners only, financial):**
- Service, repairs, tyres, fuel, rego and insurance per vehicle.
- Cost per km and per month.

**Vans as containers (replaces the `VEHICLE` custody target):**
- Any asset can hold other assets: tools can be **"in Van 3"**.
- Moving the container moves everything in it, with history recorded for each item.
- Scanning the van lists its contents; a "stocktake" mode ticks items off by scanning.

**GPS tracking (later, optional):**
- Integration with a telematics provider, not built in.
- **Opt-in per company with clear notice to drivers**: some states require written notice before tracking employees (e.g. the NSW Workplace Surveillance Act).

**Permissions additions:**
- `assets.vehicles.log`: odometer readings, pre-start checks, fuel entries (Employee default)
- `assets.vehicles.service`: logbook entries, renewals (Foreman default)
- `assets.costs.view`: running costs (Owner default, financial)

**Data model additions:**
- `Asset.parentAssetId`: container relationship (asset inside a van/toolbox); custody `holderType` becomes `STORE | PROJECT | USER | ASSET`.
- `VehicleDetails`: `assetId` (1:1), `rego`, `vin`, `year`, `fuelType`, `assignedDriverId`, `fuelCardLast4`, `tyreSizes`.
- `OdometerReading`: `assetId`, `km`, `at`, `byUserId`, `source` (`CHECKOUT | SERVICE | MANUAL | PRESTART`), `flagged`.
- `ServiceRule`: `assetId` or `categoryId`, `everyMonths?`, `everyKm?`.
- `ServiceEntry`: `assetId`, `date`, `km`, `workshop`, `workDone`, `parts`, `cost Decimal`, `invoiceDocId?`, `nextDueDate?`, `nextDueKm?`.
- `Renewal`: `assetId`, `kind` (`REGO | INSURANCE | ROADWORTHY | CERTIFICATION | OTHER`), `expiresAt`, `reference`, `docId?`.
- `PrestartCheck`: `assetId`, `byUserId`, `at`, `km`, `items Json`, `passed`.
- `AssetCost`: `assetId`, `kind`, `amount Decimal`, `at`, `note`, `docId?`.

**Build order (after section 9's steps):**
6. Vehicle fields, odometer, service rules and logbook.
7. Renewals and reminders.
8. Pre-start checks.
9. Containers (assets in vans), stocktake scan.
10. Running costs.

## What part 1 built (Nov 2026)

- **The `assets` Block** (optional; depends on companies and templates). Permissions so far: `assets.view` (everyone) and `assets.manage` (Owner, Foreman). The rest of §5 come with their parts.
- **/assets**: search (name, number, make, model, serial, barcode, tag code), a scan button, category chips, In use / Retired, and **Select → Print tags**. **/assets/<id>**: photos, details, the category's own fields, the QR tag and its typed code; Change, Print tag, New tag (the old sticker stops working), Retire / Put back, Delete (only for something added by mistake: its tag is revoked, its number isn't reused).
- **Asset No.** is per business, next number by default, editable to match stickers already used. A **barcode it already has** can be linked; scanning it opens the asset.
- **Tags** are route codes (`RouteCode`, entityType `Asset`), so `/go/<code>` opens the asset; the QR holds `routeCodeUrl(code)`.
- **Sticker sheets** (decided Nov 2026, `sticker-layouts.ts`, tested): named by labels per sheet and size with the Avery code most brands say they match (8, 10, 14, 16, 21, 24, 40, 65 per A4 sheet), a 62 × 29 mm label printer, and **Custom** (typed off the packet: A4 sheet or label printer). **Start at label** for part-used sheets, a **Test page** (each label's outline, to hold against the sheet), and **Move everything** (mm) for a printer that prints a little off. Saved per business in `AssetSettings`. Small stickers show only the QR code, number and code. `renderPdf` gained `sheet` (every page an exact size, no margins).
- **Settings › Asset categories**: categories with their own fields (text, number, date, yes or no), and the trade's starting set offered (`presets.ts`).
- **The one scanner** (`/scan`, navigation.md §7a): the phone's own barcode reader, or ZXing on iPhone; `GET /api/scan?text=` resolves Grid's codes (any `/go/` link, a tag address, or typed), then each Block's new `scanLookup` hook (assets: barcodes), then this server's own links. The camera needs https; **Type it instead** always works.
- **Not yet:** custody, faults, lost, inspections, the job tab and Home widgets, vehicles, the public tag page (parts 2 onwards, §9).

## What part 2 built (Nov 2026)

- **Custody** (`custody.ts`, table `AssetCustody`): one row per move, the current one open (no `toAt`); an asset never moved is in the **Workshop**. Holders: a store (named: Workshop, Yard…), a van (by name, until vans are assets in §11), a job (and its building or level), or a person (who can also be on a job). Each move keeps the job and area's name as it read then (`placeName`), so the history still reads after a job is renamed or deleted.
- **Actions** on the asset page (§2a): the first button follows the state: **Check out** ("I've got it", optionally on a job and level), **Return** (to a store, a van, or left on a job), **Take over** (moves it to you, keeping the job it's on), or Check out greyed out with the reason (Do not use, in repair, retired, lost). A Foreman also gets **Move** and **Give to someone**. Fault and Lost join them in part 3. While solo there's no person to pick.
- **Permissions:** `assets.custody` (Employee and up: yourself, and taking over) and `assets.assign` (Foreman: others, and moving gear nobody has).
- **History** on every asset: what happened, where, who, when, until when, and the note. The list shows where each asset is, and has a **With me** tab.
- Each move sets `lastSeenAt`. A deleted job leaves its moves' names (`purgeProject`); a level with gear on it now counts in `levelUsage`.
- **Not yet:** telling the previous holder about a Take over (with notifications, stage 6), scanning counting as "seen" (part 5), and the job's Assets on site (part 5).

## What part 3 built (Nov 2026)

- **Fault** in the asset's Actions (`assets.faults.report`, Employee and up): what's wrong (Faulty, Damaged, Missing parts, Failed test, Other), a note, photos, **Do not use**, and the phone's location only when the reporter switches it on. Where it was comes from its custody. With a fault already open, **Add to that report** is offered first (more notes and photos, or making it Do not use); a different fault can still be reported.
- **The asset's status follows what's open on it** (`status.ts`, tested), worked out again after every step: retired → Retired; lost or stolen → Lost; an open Do-not-use fault → Do not use; one in repair → In repair; any other open fault → Faulty; nothing open → In service. Do not use, In repair, Lost and Retired grey out Check out with the reason. Do not use shows a red banner on the asset.
- **Steps** (`assets.faults.manage`, Foreman): Acknowledge, Send for repair, Fixed, or Retire the asset, each with a note, a person and a time, plus **Add a note**. Fixed closes the fault and the asset goes back in service unless something else is open. The **Faults** page (`/assets/faults`) lists every open fault, Do not use first.
- **Lost** in the Actions (`assets.faults.report`): the last known whereabouts filled in from its custody (editable), Lost or Stolen, the police report number for stolen gear, a note. **Recovered** clears it and checks the asset in where it is now (workshop, van or job). **Retire as lost** (`assets.lost.retire`, Owners) takes it off the list for good, history and tag kept; Recovered still brings it back.
- **Telling people** (decided Nov 2026, until notifications in stage 6): Owners and anyone who looks after faults are **emailed** when a fault (subject starts "DO NOT USE:" for unsafe ones) or a loss is reported, and the reporter is emailed when it's fixed, when the server has email set up. Home's **Needs attention** shows each lost or stolen asset, the Do-not-use count and the other faults to sort out.
- **Not yet:** offline reports in the outbox, quiet hours and push (stage 6), sightings and the public tag page (§10), the "Do you still have it?" nudge (part 5).

## What part 4 built (Nov 2026)

Decided Nov 2026: the asset screens follow **Docket's Fixtures** (the owner's home app, used daily) in layout, options and wording, in Grid's own look. Part 4 is laid out like Docket's **Service** card; part 4b brings the rest of the list and asset page across.

- **Routines** (`AssetRoutine`): a name, **every so many months**, and **Must pass to use it** (test & tag, height safety). Set on a **category** (Settings › Asset categories; every asset in it follows, and a change there changes it on all of them) or on **one asset** (Add routine on its page). The trade's starting set now brings **Test & tag every 3 months** (AS/NZS 3760 for construction sites) on power tools, leads, generators and the like, **Height safety inspection every 6 months** (AS/NZS 1891.4) on harnesses, and **Calibration every 12 months** (not must-pass) on test equipment. Months only: no km until vehicles.
- **When it's due** (`due.ts`, tested), like Docket's service plans: from the latest check that covered it; for a must-pass routine only a **pass** counts. Chips: fine (due later), coming up (within 30 days), late (overdue), and **Not done yet** for gear never tested. Never-tested gear **isn't blocked**, so adding 50 tools doesn't stop work; it shows Not done yet until its first test.
- **The Log** (`AssetCheck`): **Checked ▾** gives *Checked today*, *Checked earlier* and *Book it in*. A check has the routines it covered (pills), what was done, the date, **Passed or Failed**, who did it, a cost, certificates, photos or the invoice (PDF or pictures), notes, and for test & tag the **tag colour**, picked from the date (Red Dec–Feb, Green Mar–May, Blue Jun–Aug, Yellow Sep–Nov) and changeable. Edit or Delete from its ⋯ menu.
- **A fail** opens a **Failed test** fault, **Do not use**, and Owners and Foremen are emailed ("DO NOT USE: … failed Test & tag").
- **Overdue** (new status, decided Nov 2026): once a must-pass routine is past its due date the asset is **Overdue**: a red banner ("Test & tag overdue"), Check out and Take over greyed out with the reason, until a pass is logged. Its order in `status.ts`: Retired, Lost, Do not use, **Overdue**, In repair, Faulty, In service. The asset keeps its soonest must-pass due date (`nextInspectionDue`) for lists and Home.
- **The morning check** (`assets.morning`, 6 am): gear that tipped past due becomes Overdue, and each business's Owners and Foremen get **one email** listing it.
- **Bookings** (`AssetBooking`): **Book it in** (what for, the day, where or who) shows as "Booked 3 Dec · Spark Safe Testing" until it's logged; once its day has passed it asks **Yes, log it** or **It didn't happen**. One booking per routine; logging a check closes it.
- **Where it shows:** the asset page's **Inspections and servicing** card; the list's **Due** view (overdue first, then the soonest, within 30 days) and a due chip on each row; Home's **Needs attention**: assets overdue for a test, and tests due in the next 2 weeks.
- **Permission:** `assets.inspections.record` (log and book; Foreman). Routines are part of `assets.manage`.
- **Not yet:** reminder emails before the due date (Home shows what's coming up), the job's Assets on site (part 5), km-based servicing (vehicles, §11).

## What part 4b built (Nov 2026)

Docket's Fixtures layout and options, brought across in Grid's look (concept C tokens; the Soft look shows Docket's own tile colours).

- **The list** (Docket's Fixtures list): cards in groups by **where the gear is**: With you, then the workshop and each van (A–Z), then each job, then With other people (each card says who). One column on phones, two on tablets, three on a big screen. A card has the asset's square (its photo, or its **category's picture** on the category's colour), the name, "No. 12 · Makita DHP486", and chips for what needs a look: Do not use / Overdue / Lost, the next test due, the **warranty** (shield icon and date; running, ending within 90 days, ended), **kit pieces** and **documents**. Search, scan, category chips and In use / With me / **Due** / Retired stay above; Due is one list, most urgent first. Select → Print tags as before.
- **Asset register** (Docket's Insurance Report, header button, `assets.manage`): a landscape PDF of everything in service, by category, with photo, number, make and model, kit pieces, serial, bought, where bought, price paid, replacement cost, warranty and where it is, with totals per category and overall.
- **The asset page** (Docket's item page): a round back button, the name and the **⋯ menu** (Edit asset, Add kit piece, Duplicate, Print tag, New tag, Retire or Put back in service, Delete). Then the banners; the **summary line** (picture, make and model or the category, "Category · Asset No. 12") with **Product page**, **Brand support** and the support phone as buttons; **Where it is** and its Actions (Grid's own); then **Details** beside the **brand card**, **Kit pieces** and the **Tag**, two columns on a computer; then Inspections and servicing, Faults, **Manuals, links and documents**, and History.
- **Details** (Docket's): Asset No., Model and Serial (**tap to copy**), the category's fields, Where bought, Bought, the Warranty chip, Price paid, Replacement, Barcode (tap to copy), and notes in a tinted box. More than one photo shows as a strip on top.
- **The form** (Docket's Add Item drawer): a panel from the right on a tablet or computer, from the bottom on a phone, with Cancel and Save pinned at the bottom. Name, Category and Asset No., the category's fields, Photos; **Make and model** (the make offers the business's brands as you type), Model, Serial, Product page, Where bought; **Dates and warranty** with **+1, +2, +3, +5 years** from the date bought; **Value** (Price paid, Replacement cost); the barcode it already has; **Track tests and servicing** (stays on while its category has routines) and **Track kit pieces** (stays on while it has any); notes.
- **Brands** (decided Nov 2026): the make links to the brand in **Materials** (`brandId`; a new make adds the brand). The **brand card** shows its support site, website, phone and email, set once and shared by every asset of that brand (Edit needs `materials.manage`). Assets now depends on Materials.
- **Kit pieces** (`AssetPart`, Docket's Parts): name (Battery, Charger, Case… to pick), make, model, serial, warranty, photo and notes, with Edit and Remove in each one's ⋯. Not tagged or listed on their own; a piece that moves about by itself is better as its own asset. A piece's warranty counts towards the list card's chip.
- **Manuals, links and documents** (`AssetDocument`, Docket's card): grouped by the whole asset and each piece, each with **Add to …** (Upload PDF or photo, Take photo, Add web link). Kind (Manual, Warranty, Receipt or invoice, Certificate, Photo, Other, Web link) is guessed from the file and changed in Edit details. A PDF or photo opens **inside Grid** (`/assets/<id>/file/<fileId>`, page pictures in the cache, as handover does); a test's certificate opens the same way.
- **Duplicate** (Docket's): one card per copy, each with its own serial and its pieces' serials, and **Another copy**. Each copy gets the next number and its own QR tag; the details, category fields, kit pieces and its own routines are copied; then **Print their tags**. Copies share one `docSetId`: **manuals, warranties and links** filed to one show on all of them ("shared with copies"); receipts, certificates and photos stay on the one they were filed to. Deleting an asset moves its shared documents to a copy. Photos, the log, custody and faults aren't copied.
- **Category pictures** (`AssetCategory.icon`, `category-icons.ts`): picked in the category's editor (now a drawer like the rest), guessed from the name when not picked (Power tools → drill, Leads & RCDs → plug…), and shown on the categories list.
- **`@grid/ui`:** `DropdownMenu` (every ⋯ menu and "Checked ▾") and a pinned `footer` on `SheetContent`.
- **Not changed:** the custody, fault and lost sheets keep their short centred dialogs (they're quick questions, not forms to fill in; Docket has nothing like them).
- **Not yet:** Works With (batteries shared across tools), price tracking, and the insurance pack with receipts (a ZIP, like Docket's).

## What part 5 built (Nov 2026)

Decided Nov 2026: **Not seen after 30 days** and **"Do you still have it?" after 14 days**, both changeable per business.

- **Scanning counts as seeing it.** Every move already set `lastSeenAt` (part 2). Now a scan does too: a tag opened by the phone camera (`/go/<code>`) or the one scanner (`/scan`, including a linked barcode) opens `/assets/<id>?scanned=1`, and the page (`ScanSeen`, `ui/Sightings.tsx`) calls `POST /api/assets/<id>/seen` once and takes the `?scanned=1` off, so a refresh doesn't count again. Opening the asset from the list doesn't count: only a scan or a move means someone actually had it in front of them. Each sighting is in the activity log ("seen").
- **Not seen** (`sighting.ts`, tested; `seen.ts`): nothing has moved or scanned it for the business's **Not seen after** days (`AssetSettings.notSeenDays`, default 30). Gear never moved counts from when it was added. Retired and lost gear never count (they have their own state).
  - A **Not seen since 19 Oct** chip on the list card, a **Not seen** view on the list (`?show=notseen`, beside Due), and a line under Where it is on the asset page.
  - Needs attention (for whoever manages faults): "3 assets not seen lately", opening the Not seen view.
  - One email to Owners and Foremen the morning an asset crosses the line (when the server has email set up).
- **"Do you still have it?"** (the nudge, §3a step 6): gear **with you**, or that **you left on a job** (Return → On a job, so a sole trader's Hilti left at Smith St counts), not seen for **Ask "Do you still have it?" after** days (`AssetSettings.stillGotItDays`, new, default 14).
  - A row in Needs attention for that person, with **Yes** (counts as seeing it; the row goes) and **No** (opens the asset with `?report=lost`, which opens the Lost sheet straight away).
  - One email to that person the morning it starts. Push comes with stage 6.
  - Gear in the workshop or a van isn't asked about (nobody's holding it); it shows as Not seen instead.
- **Test & tag reminder emails** (left over from part 4): Owners and Foremen get one email **14 days before** a must-pass routine is due (`REMINDER_DAYS_BEFORE`), so there's time to book it in. The Overdue email on the day stays as it was.
- **The morning run** (`assets.morning`, 6 am): the overdue check, then the 14-day reminders, then Not seen and "still got it?" emails. Each email goes on the one morning its line is crossed (`crossesToday`), so nothing repeats and there's no sent-log table; a morning the server was off is missed (Home still shows everything).
- **Assets on site** on the job page (panel slot `job.top`, beside the job checklist): gear left on the job, or with someone who took it there, each with who has it, the building or level, and since when; a chip for Do not use, Overdue and the like. Shown only when there's something there, and not on Quoting / Not won jobs.
- **Home** (`home.widgets` in §6 became Needs attention): the Soft look's **Needs attention** gets Not seen and the "still got it?" rows; the Grid look now shows the same Assets rows as a **Needs attention** card at the top of Home (`home.top`), which it didn't before.
- **Settings › Asset categories › Reminders** (`assets.manage`): the two numbers of days (`GET`/`PUT /api/assets/settings/reminders`, 1–365).
- **Formatting helpers moved to `ui/format.ts`** (no "use client"): the asset page is a server page and called `when()`, `dayText()` and `money()` from `ui/shared.tsx`, a "use client" file, which Next refuses ("Attempted to call dayText() from the server"). `shared.tsx` re-exports them for the client components.
- **Not yet:** push and quiet hours (stage 6); sightings from the public tag page (§10); a "seen on" place when scanning (the scan only records the time).

