# Documents block + company connections: agreed design

Status: **agreed, not built yet.** Build after stage 3 (needs file storage and the worker container).
Two parts:

- **Company connections**: an addition to the `companies` block (or a small `connections` block).
- **Documents**: block id `documents`, depends on `companies`.

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
- Word and Excel files are converted to PDF on upload (in the worker), so they open in the same viewer; the original is kept for download.
- Per document (default from the library): **Available offline** and **Allow download**. With download off, the file can only be viewed in the app.

### Viewing

- PDFs open **inside the app** in a page-by-page document viewer: scroll, pinch-zoom, jump to page, find on page, a pages list, and "Pin to a project".
- Opening from a search result lands **on the matching page** with the search words highlighted and next/previous match buttons.
- Offline documents open with no signal.
- Photos open full screen.
- Plans don't use this viewer: they use the tiled plan viewer, which carries markups, pins and measurements.

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
- **Projects:** attach a library document to a project's documents so everyone on that job can see it.
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

Default grants: Employee view + notes.write (Private notes); Foreman view + upload + edit + products.manage + notes.share; Owner all.

### Menus

- `sidebar.main`: "Documents" (icon `file`)
- `settings.company`: "Document libraries"
- `home.widgets`: "Recently added documents"

### Data model sketch

- `DocumentLibrary`: `companyId`, `name`, `kind`, `isFinancial`, access settings.
- `LibraryDocument`: `libraryId`, `title`, `manufacturer`, `models String[]`, `productType`, `tags String[]`, `currentVersionId`, `deletedAt`.
- `DocumentVersion`: `documentId`, `fileKey`, `fileHash`, `mimeType`, `pages`, `ocrApplied`, `uploadedById`, `createdAt`.
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

### Build order

1. Company connections (small; useful on its own and for stage 2 invites).
2. Libraries, upload, versions, viewing.
3. Text extraction + search.
4. OCR for scans.
5. Offline + product scanning.
6. Icon and project links.
7. Product catalogue (manufacturer → division → family → model), document ↔ product links, model-number search.
8. Product notes with Private / Shared visibility and source-page links.
9. Installed products on plans; shared catalogue on the hosted site later.
