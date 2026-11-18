# Documents block + company connections: agreed design

Status: **being built (phase 5b).** Part 1 (libraries, job documents, versions and the page viewer) is done: see "What 5b part 1 built" below. Company connections wait until sharing with subcontractors (later).
Two parts:

- **Company connections**: an addition to the `companies` block (or a small `connections` block).
- **Documents**: block id `documents`, depends on `projects` (job documents) and, later, `companies` connections.

## What 5b part 1 built (Nov 2026)

The `documents` Block (optional, on for every trade and for sole traders; pages at `/documents`, API `/api/documents`):

- **Libraries.** A business starts with Manuals, Data sheets, Certificates and Procedures (made the first time anyone opens Documents). **Settings › Document libraries** (`/documents/settings`, `documents.libraries.manage`) adds, renames and removes them (only an empty one can go) and sets **Allow download** for documents added from then on. `isFinancial`, `availableOffline` and `roles` are stored for later; there are no screens for them yet, so every library is seen by everyone with `documents.view`.
- **Documents page** (`/documents`, `/documents/library/<id>`): chips for All and each library with counts, a search box (title, manufacturer, model numbers, tags, library; every word has to match), a picture of each document's first page, and Upload (pick a library, then files).
- **Uploading.** `/api/files` now also takes Word, Excel, PowerPoint, OpenDocument, CSV and text files (150 MB), checked by their name and first bytes together (`officeType()` in `@grid/db`). Each file becomes a document titled from its file name. **Duplicate check:** the same file already in that library (or that job) is skipped and named ("RT-200.pdf is already in Manuals as …") with an **Add it anyway** button.
- **Job documents** (`/documents/job/<projectId>`, and a **Documents** card on the job page, panel `job.area`): the job's folders, made from the business's **Job folders** list (Settings › Document libraries; starts as Fit-off, Points lists, Schedules, Certificates) the first time the job's Documents open. Upload to a folder, add, rename or remove folders (removing one moves what's in it to "Not in a folder"), and **Add from the library** (a pinned library document shows in a folder marked "Library"; moving it or taking it off the job doesn't touch the library copy).
- **Viewer** (`/documents/doc/<id>[/<versionId>]`): PDF pages one under another on paper, rendered in the background (`documents.render`: pdftoppm, 2000 px on the long side, JPEG, plus a thumbnail; `<files>/.cache/documents/<versionId>`). Page x of y (tap to jump to a page), a **Pages** sheet of every page, zoom with the buttons, two fingers, or Ctrl + scroll (100–400%). Photos open in the same viewer. Word, Excel and other files show their name and size with **Download** until their viewers come (Word to PDF and the spreadsheet viewer are later parts).
- **Versions.** Upload a new version (it becomes current); Versions lists every one with who and when, **View** an older one (with a "You're looking at an older version" note), **Make current**, and **Remove** (not the only one; its file is deleted straight away).
- **Details:** title, library (or folder for a job document), manufacturer, model numbers, product type, tags, description, **Allow download**. With download off, only people with `documents.edit` can download the original; everyone else reads it in Grid. Photos can always be viewed.
- **Pin to a job** from a library document (`documents.edit`): your active jobs; already-pinned jobs are listed with Take off.
- **Delete** goes to Recently deleted (**Settings › Storage**, panel `storage.deleted`, `documents.delete`): Restore or Delete now; the storage clean-up removes it for good after the set days ("Deleted document"). Deleting a business removes its documents (`purgeCompany`).
- **Permissions:** `documents.view`, `.upload`, `.edit`, `.delete`, `.libraries.manage`. Foreman: view, upload, edit. Employee and Viewer: view. Owner: all. (`products.manage` and the notes permissions come with the product catalogue.)
- **Data:** `DocumentLibrary`, `DocumentSettings` (`jobFolders`), `JobDocumentFolder`, `LibraryDocument` (library or job), `DocumentVersion` (`status`, `pages`, `pageSizes`; `sheets` stored for the spreadsheet viewer), `DocumentLink` (pinned to a job).
- **Not yet:** find on page and search inside documents (part 3, text extraction), Word to PDF, the spreadsheet viewer and Sign-offs (parts 2b and 2c), offline, the product catalogue, company connections.

## Why it exists

Subcontractors are often handed parts to install that came without documentation. If the main contractor keeps manuals and data sheets in the app, anyone they work with regularly can find them on the spot.

## Part 1: Company connections ("Subcontractors" list)

**Subcontractors are connected companies, not Members.** Members are employees: their role grants company permissions, they count as your staff for safety records, and they appear in team lists. Making subbies Members would give them access you never meant to give, leave them inside your company after they stop working for you, and break the rule that each company manages its own people.

How it works:

- Company page gets a **Subcontractors** list, separate from Members.
- Invite another company by name, ABN or email; **its Owner accepts**. A company not on the app gets a sign-up link.
- **A sole trader is a one-person company**, so the same flow covers an individual subbie with an ABN.
- **Not tied to a project.** It persists between jobs, so regular subbies can reach your manuals whether or not you're on a project together.
- **Per-connection sharing:** choose which document libraries each connected company sees (e.g. "Manuals" yes, "Quotes & pricing" no).
- **Ending the connection** removes access immediately. Either side can end it. Audit-logged.
- **Projects shortcut:** inviting a connected company to a project pre-fills its usual terms (stage 2 invite flow).

Permissions (companies block):

- `companies.connections.view`
- `companies.connections.manage`: invite, accept, end, set sharing

Data model:

- `CompanyConnection`: `companyId` (the main contractor), `subcontractorCompanyId`, `status` (`INVITED | ACTIVE | ENDED`), `invitedById`, `acceptedById`, `endedAt`, timestamps. Unique on the pair.
- `ConnectionShare`: `connectionId`, `libraryId`.

## Part 2: Documents block

### Libraries

- Documents live in **libraries**: Manuals, Data sheets, Certificates, Procedures, and custom ones.
- Access per library:
  - own staff (all, or by role/permission);
  - chosen connected companies (via `ConnectionShare`);
  - optionally attached to a project, following that project's visibility rules.
- Financial categories (quotes, pricing) are never shareable by default.

### Uploading

- PDF, images, Office files.
- Optional details: manufacturer, model number(s), product type, tags, description.
- **New versions** replace the current file but keep history; old versions stay viewable.
- Duplicate check by file hash ("This file is already in Manuals").
- Word files are converted to PDF on upload (in the worker), so they open in the same viewer; the original is kept for download. Spreadsheets aren't: they open in the spreadsheet viewer (see "Spreadsheet viewer").
- Per document (default from the library): **Available offline** and **Allow download**. With download off, the file can only be viewed in the app.

### Viewing

- PDFs open **inside the app** in a page-by-page document viewer: scroll, pinch-zoom, jump to page, find on page, a pages list, and "Pin to a project".
- Opening from a search result lands **on the matching page** with the search words highlighted and next/previous match buttons.
- Offline documents open with no signal.
- Photos open full screen.
- Plans don't use this viewer: they use the tiled plan viewer, which carries markups, pins and measurements.
- Spreadsheets open in the spreadsheet viewer below.

### Job documents (agreed November 2026)

Files that belong to one job, not the business-wide library: fit-off sheets, points lists for controllers, schedules, test results, the builder's drawings register.

- **A Documents section on each job** (a panel on the job page, like Photos). Upload straight to the job from the phone or computer: PDF, photos, Word, Excel, CSV.
- **Folders per job:** a starter set (Fit-off, Points lists, Schedules, Certificates) set per business in Settings › Document libraries, plus any folder made on the job. A folder can be left empty or removed.
- **Versions** work like library documents and plan revisions: a new upload replaces the current file, the old ones stay in the history and stay viewable.
- **Available offline** per file (and per folder), for plant rooms and basements.
- **Library documents linked to the job** ("Pin to a project", see Links) show in the same section, marked as from the library. Unlinking doesn't touch the library copy.
- **Who sees them:** anyone who can see the job and has `documents.view`. Job documents follow the job: when multi-company jobs arrive (phase 8), each business's job documents stay its own unless shared, like photos.
- **Deleting** a job document is a soft delete into Recently deleted (Settings › Storage), restorable until the clean-up removes it. Deleting a business removes its job documents with it (the `purgeCompany` hook).
- **Search** covers job documents too (PDF text and spreadsheet cell text), filtered to the jobs the person can see; a job's own search box searches only that job.

### Spreadsheet viewer (agreed November 2026)

Excel (`.xlsx`, `.xls`), OpenDocument (`.ods`) and CSV files open in a viewer made for spreadsheets, instead of being squashed into a PDF. Used for job documents and library documents alike. **View only:** editing stays in Excel or Google Sheets; upload a new version to change it.

- **Sheet tabs** along the bottom, one per sheet in the file (hidden sheets left out).
- **Frozen header row and first column** while scrolling. Grid guesses the header row (the first full row); it can be changed per sheet ("Header row: 3"), saved with that version.
- **Looks like the file:** column widths, merged cells, bold, fills, number and date formats, hidden rows and columns hidden. Formulas show their last saved value (no recalculating).
- **Search** the whole file: matches highlighted, next/previous, jumps across sheets.
- **Filter a column:** tap a header for its values with counts (e.g. Level 2, or one controller) and tick the ones to show. **Sort** by a column. Both only change the view, never the file, and are cleared with one tap.
- **Phone-friendly:** pinch to zoom, smooth scrolling through thousands of rows (only the rows on screen are drawn), and a **row card**: tap a row number to see that row as a list of "Header: value" lines, easier to read on a phone than a wide row.
- **Offline:** works with no signal when the file is Available offline.
- **Download** the original, if the document allows download.
- **How it works:** on upload the worker reads the file once (SheetJS, in the background job `documents.sheet`) into a compact per-sheet JSON (cells, formats, merges, widths), kept in `cacheRoot()` since Grid can rebuild it from the original. The phone downloads that, not the Excel file. Cell text goes into search like PDF page text.
- **The viewer has a slot,** `documents.sheet`, that other Blocks draw into (a column beside the row numbers, a toolbar button, a progress line), the same way the `markups` Block draws on the plan viewer through `plans.viewer`. Row sign-offs use it.

### Row sign-offs: the `signoffs` Block (agreed November 2026, a trial)

Sign off a row on a fit-off sheet or points list as you finish it: "142 of 380 signed off". **A trial**, so it's its own small optional Block that can be switched off or taken out without touching Documents. The screens say "sign off" throughout, never "tick".

- **Block id `signoffs`**, Store name "Sign-offs", depends on `documents`, not core. Turned off in the Store, the sign-off column and progress disappear and the sign-offs are kept (turn it back on and they're there). Removing it from Grid altogether means deleting `blocks/signoffs/`, its line in `apps/web/src/blocks.ts`, and (if wanted) its tables with a migration. Nothing in the `documents` Block refers to it; it only draws into the `documents.sheet` slot and listens to documents events. (Not the same as the core `signatures` Block, which is for clients signing quotes.)
- **Signing off:** a sign-off box at the start of every row below the header row (blank rows have none). Tap to sign the row off, tap again to undo it. Each sign-off shows who and when; the row card shows the history and an optional short note ("Tested, reads 21.4 °C").
- **Progress** at the top of each sheet ("142 of 380 signed off") and on the job's Documents section next to the file. A filter shows **To do / Signed off / All** (works with the column filters, e.g. "Level 2, to do").
- **Matching rows across versions.** Sign-offs are kept in Grid, never written into the file. Each sheet has a **match column**, guessed from the header (Point name, Tag, Circuit, ID) and changeable, so sign-offs follow a row when a new version reorders or adds rows. Without one, rows match by their whole content. When a new version is uploaded, sign-offs move to the matching rows; any that no longer match are listed as "6 sign-offs don't match the new version" to look through, and are never silently lost.
- **Offline:** sign-offs made with no signal wait on the phone and are sent later, like photos. If two people sign off the same row, the first stands and both are in the history.
- **Export:** "Download with sign-offs" gives a copy of the spreadsheet with Signed off, By and When columns added: handy for commissioning handover. The original is untouched.
- **Permissions:** `signoffs.view`, `signoffs.sign` (sign off rows and undo your own), `signoffs.manage` (undo anyone's, set the match column, clear a sheet). Default grants: Employee view + sign; Foreman and Owner all. While solo, it's just you.
- **Audit:** every sign-off and undo writes the audit log (entity `SheetSignoff`).
- **Data:** `SheetSignoff`: `companyId`, `documentId`, `sheetName`, `rowKey` (the match column's value, or a hash of the row), `signedOff`, `note?`, `byId`, `at`; append-only, latest per row wins, so the history is the table itself. `SheetSignoffSettings`: `documentId`, `sheetName`, `matchColumn?`.

### Product catalogue (for manufacturers with many products)

Large manufacturers (e.g. Honeywell's building automation range) have hundreds of models. Documents are organised by **product**, not folders.

**Tree:** Manufacturer → Division / brand → Product family → Model.
- Divisions can list **brand aliases**, so searching a brand name finds the right division.
- Models can have **alternative part numbers and order-code variants** (suffixes for voltage, colour, comms type). Any of them finds the model.
- Models can be **Superseded by…** another model, or **Discontinued**. They stay findable for servicing old installs; search shows "Discontinued, replaced by X".

**Who sets up the catalogue**

The catalogue is filled **as people work**, so a company only holds the products it actually uses.

- **While uploading:** if the manufacturer or model typed doesn't exist, "Add RT-200 as a new model?" creates it. The person picks a family, creates one, or leaves it **Unsorted**.
- **While scanning:** "No match" offers **Add this product?** with the model number already filled in (see Scan the product).
- **From the quotes price book:** price book items carry supplier codes. Supplier CSV imports (quotations spec) can create models and link them, so products the company buys appear automatically.
- **Starter list:** new companies get a list of common manufacturer **names** to pick from. Divisions, families and models are added as needed.
- **Tidying (`documents.products.manage`, Owners and Foremen by default):**
  - move models between families and merge duplicates (e.g. "RT200" and "RT-200"); merging keeps every document link, note and install record;
  - add part-number variants and brand aliases;
  - mark models Superseded or Discontinued.

  Unsorted models and likely duplicates show in a short **to-do list** on the Documents screen.
- Employees can't add or change products. When they hit a missing product, they get "Ask a Foreman to add it", which sends a request.

**Who owns what**

| | Scope | Who can see it |
|---|---|---|
| **Structure:** manufacturers, divisions, families, models, part numbers, aliases | **Shared across all companies on the server.** These are plain product facts, so a subcontractor doesn't re-enter the same thermostat. | Everyone on the server |
| **Content:** documents, product notes, pricing, installed-product records | The company that created it | Per library and per note rules (Private / Shared) |

- Changes to shared structure are logged with the company and person, and can be undone.
- Merges and moves of entries another company also uses need `documents.products.manage` and show "Used by 2 other companies" first.
- **Hosted site (later):**
  - one platform-wide catalogue built from all companies' additions;
  - new entries stay **local to the adding company** until the platform admin (Super Admin) accepts them into the shared catalogue, merging duplicates;
  - eventually, **verified manufacturer or wholesaler accounts** could maintain their own range and public data sheets.

**Documents ↔ products are many-to-many.** One family data sheet links to every model it covers. Each model page lists its documents grouped by type:
- data sheet;
- installation / wiring;
- programming & commissioning;
- points list / integration (BACnet, Modbus);
- firmware / release notes;
- approvals & certificates;
- safety data sheet.

**Product notes:** practical notes kept on a model or family, e.g. DIP switch settings, commissioning steps, gotchas, the right replacement part.
- Each note has an author, a date, optional photos, and an optional **source link to a document page** ("Commissioning guide, p. 12"). Tapping the source opens the viewer on that page.
- **Visibility per note:**
  - **Private:** your company's staff only. This is the default.
  - **Shared:** also visible to the connected subcontractors who can see this library, e.g. commissioning tips that help them during installation.
- The label is "Shared", not "Public", so nobody thinks the note is visible to everyone on the internet or in the later shared catalogue.
- Only your company can edit or delete its notes. Subcontractors see Shared notes read-only and can keep their own notes in their own company.
- A note can be switched between Private and Shared at any time, and the change is logged.
- Notes can be marked **Pinned** (shown first) and appear on the model page and next to the linked document page in the viewer.
- Search covers note text too, filtered by what the searcher is allowed to see.

**Finding products:**
- **Scan the label:** a barcode or model number opens the model page (see Scan the product).
- **Model-number search** ignores spaces, dashes and variant suffixes.
- **Browse** manufacturer → division → family, with counts.

**Installed products:**
- A plan symbol (e.g. a thermostat icon) can be linked to the **model installed there**. Tapping it on site opens that model's documents and notes.
- If the unit is tagged, scanning it later on a service visit shows the model, its documents, when it was installed and on which project.

**Later, hosted site: shared catalogue.** Manufacturers' publicly published documents could be held once in a platform-wide catalogue (with their source links) instead of being uploaded by every company. Company libraries link to them, and company notes stay with the company.

### Search

- **Full text, not just titles.** On upload the worker extracts the text from each page and stores it, so a search like "RCBO 40A trip curve" lands on the right page.
- **Postgres full-text search** (`tsvector` + GIN index, `ts_headline` for highlighted snippets). No extra search server on the Unraid box. Add `pg_trgm` for typo-tolerant model-number matching.
- **Scanned manuals** (photos of paper) go through OCR in the worker: `ocrmypdf` (Tesseract). The output is a searchable PDF.
- Filters: library, manufacturer, product type, tags, file type.
- Results open at the matching page.

### Scan the product

Every search bar has a **scan button** on its right. It uses a viewfinder/barcode icon, not a camera icon, so it isn't mistaken for "add a photo". It opens the app's one scanner (see `navigation.md` §7a).

1. Tap the scan button. The camera opens full screen with a framing box, the hint "Point at the barcode, QR code or model number", and a torch button. The mode is **Auto** by default; **Barcode / QR** and **Model text** are available if Auto struggles.
2. The phone reads the **barcode/QR** (e.g. `expo-camera` barcode scanning) or the **model number printed on the label** (on-device text recognition). Recognition runs on the phone, so it works offline against the synced catalogue.
3. The read text is matched like model-number search: spaces, dashes and variant suffixes are ignored, and part-number aliases count.
   - **One match:** a result card shows the model, which variant matched, and counts of documents, notes and installs, with **Open**.
   - **Several matches:** a short list to pick from.
   - **No match:** "Add this product?", with the model number filled in (needs `documents.products.manage`; otherwise "Ask a Foreman to add it").
   - **Unreadable:** **Type it instead** opens the search box; **Scan again** retries.
4. In the documents library and on a manufacturer page, the scan is limited to products. Elsewhere it's the general scanner.

### Offline

- "Available offline" per document or per library. Files plus their extracted text sync to the phone, so search works without signal (SQLite FTS5 on device).
- Respects the selective-sync storage limits from the offline design.

### Links into the rest of the app

- **Markup icons:** link a document to an icon type (e.g. a switchboard or exhaust-fan icon). Tapping a placed icon on a plan offers its manual.
- **Projects:** attach a library document to a job's Documents section so everyone on that job can see it (see Job documents).
- **Tasks/RFIs later:** reference a document from a task or RFI.

### Permissions (documents block)

- `documents.view`
- `documents.upload`
- `documents.edit` (details, new versions)
- `documents.delete` (soft delete; history kept)
- `documents.libraries.manage` (create libraries, set access and sharing)
- `documents.products.manage` (add manufacturers, families and models; link documents)
- `documents.notes.write` (add and edit product notes; making a note Shared needs `documents.notes.share`)
- `documents.notes.share`

Job documents use the same permissions, on top of being able to see the job. Row sign-offs have their own (`signoffs.*`, above).

Default grants: Employee view + notes.write (Private notes); Foreman view + upload + edit + products.manage + notes.share; Owner all.

### Menus

- `sidebar.main`: "Documents" (icon `file`)
- `settings.company`: "Document libraries"
- `home.widgets`: "Recently added documents"

### Data model sketch

- `DocumentLibrary`: `companyId`, `name`, `kind`, `isFinancial`, access settings.
- `JobDocumentFolder`: `companyId`, `projectId`, `name`, `sort`. The business's starter folder names live in its settings.
- `LibraryDocument`: `libraryId?` or `projectId?` + `folderId?` (a library document or a job document, never both), `title`, `manufacturer`, `models String[]`, `productType`, `tags String[]`, `currentVersionId`, `deletedAt`.
- `DocumentVersion`: `documentId`, `fileKey`, `fileHash`, `mimeType`, `pages`, `ocrApplied`, `uploadedById`, `createdAt`, and for spreadsheets `sheets Json` (sheet names, row counts, chosen header rows).
- `DocumentPage`: `versionId`, `pageNumber`, `text`, `search tsvector` (GIN index).
- `IconDocumentLink`: `companyId`, `iconKey`, `documentId`.
- `Manufacturer`, `ProductDivision`, `ProductFamily`, `ProductModel` are **server-wide** (no `companyId`). Each has `createdByCompanyId`, `createdById` and `status` (`ACTIVE | UNSORTED | MERGED`, plus `mergedIntoId?`). On the hosted site they also have `scope` (`LOCAL | SHARED`) and `ownerCompanyId?` for not-yet-accepted local entries.
- `CatalogueChange` (append-only): `entity`, `entityId`, `action` (`CREATE | UPDATE | MOVE | MERGE | ALIAS`), `before Json`, `after Json`, `byCompanyId`, `byUserId`, `at`.
- `ProductRequest`: `companyId`, `requestedById`, `text` (what was typed or scanned), `photoKey?`, `status`, `resolvedModelId?`.
- `Manufacturer`: `name`, `aliases String[]`, `website?`, `starter Boolean` (in the starter name list).
- `ProductDivision`: `manufacturerId`, `name`, `brandAliases String[]`.
- `ProductFamily`: `divisionId`, `name`, `productType`.
- `ProductModel`: `familyId`, `modelNumber`, `partNumbers String[]`, `normalisedKeys String[]` (stripped of spaces, dashes, suffixes; trigram index), `status` (`CURRENT | SUPERSEDED | DISCONTINUED`), `supersededById?`.
- `DocumentProduct`: `documentId`, `familyId?`, `modelId?`, `docType` (`DATASHEET | INSTALL | COMMISSIONING | INTEGRATION | FIRMWARE | APPROVAL | SDS | OTHER`).
- `ProductNote`: `companyId`, `familyId?`, `modelId?`, `body`, `photos Json`, `sourceDocumentId?`, `sourcePage?`, `visibility` (`PRIVATE | SHARED`), `pinned`, `authorId`, `updatedAt`, `deletedAt`.
- `InstalledProduct`: `projectId`, `modelId`, `markupId?`, `assetTagId?`, `installedAt`, `installedById`.

### Worker jobs (pg-boss)

1. `documents.extract`: pull text per page (`pdftotext` / pdf.js); if a page has no text, queue OCR.
2. `documents.ocr`: `ocrmypdf` → store searchable PDF + page text.
3. `documents.thumbnail`: first-page thumbnail (`sharp`).
4. `documents.index`: update `tsvector` columns.
5. `documents.sheet`: read a spreadsheet into the viewer's per-sheet JSON (in `cacheRoot()`) and its cell text for search.

### Build order

1. Company connections (small; useful on its own and for stage 2 invites). Moved to later, with sharing libraries with subcontractors.
2. Libraries, upload, versions, viewing. **Done (5b part 1).**
2a. Job documents: the job's Documents section, folders, versions, linking library documents. **Done (5b part 1).**
2b. Spreadsheet viewer, with the `documents.sheet` slot. **5b part 2 (next).**
2c. The `signoffs` Block (trial): sign-offs, progress, matching across versions, offline sign-offs, Download with sign-offs. **5b part 3.**
3. Text extraction + search. **5b part 4, the end of phase 5b.**

Later (split out of 5b, Nov 2026; not scheduled, see the roadmap's 10+ row):

4. OCR for scans.
5. Offline (with phase 6's offline sync) + product scanning.
6. Icon links: **moved to phase 4c** (built with the icons). Project links are done (pin to a job).
7. Product catalogue (manufacturer → division → family → model), document ↔ product links, model-number search.
8. Product notes with Private / Shared visibility and source-page links.
9. Installed products on plans; shared catalogue on the hosted site later.
