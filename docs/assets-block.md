# Assets block: agreed design

Status: **agreed, not built yet.** Block id `assets`, depends on `companies`.
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
- Record result: pass/fail, tester, date, next due date, optional certificate (stored in the Documents block if enabled).
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
5. Project tab, not-seen alerts, home widgets.

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
