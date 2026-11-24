# Materials and the handover sheet: design

Status: **decided Nov 2026. Part 1 (Materials) built; the Handover Block is next.** The PDF (§3) follows the owner's example: a printed, spiral-bound "Fixtures + Finishes Schedule" (cover page with a drawing of the house, then a ruled table per trade).

**Who makes what.** That example is a **builder's** schedule: every trade on the house in one book, and each trade with its own columns (lighting has Product, Colour/finish/size, Qty; paint has Walls, Trims, Ceiling per room). Grid gets there in two steps:

- **Now:** a trade business makes the schedule for **its own work**. For a sparky that's one trade, set out **room by room**, each room with its own materials.
- **Later (phase 8, multi-company jobs):** each company on a builder's job shares its section up the contract chain, and the builder's schedule combines them, every trade keeping its own columns. Nothing in the trade's own schedule changes for that; the fields below are stored now so it can.

Two parts:

- **Materials** (`materials`, **core**, `required: true`): the business's own list of the things it installs. Photo, name, brand, model, finish, trade and family. Quotes, the handover sheet and later Blocks (Assets, the product catalogue) all use the same list, the way jobs and quotes share Clients.
- **Handover** (`handover`, optional, in the Store): each job's list of what was installed and in which rooms, printed as a landscape PDF for the client at the end of the job.

## 1. Materials (core)

- **One material = one thing you can point at.** "Iconic double switch, White" and "Iconic double switch, Black" are two materials, each with its own photo and model number.
- **Families** link materials that are the same item in different finishes ("Iconic double switch"). A material's page shows the rest of its family, and on a job's list you can **swap finish** to another material in the same family in one tap. A family is optional.
- **Fields:**
  - **name**, the full product description ("Masson Accent Minitrim Adjustable LED Dimmable Downlight");
  - **item type**, the short word the client knows ("Downlight", "Wash light", "Step light", "Double GPO"; suggested from types already used, any words fine);
  - **brand** (the business's Brands list, moved here from the price book) and **model** / manufacturer code;
  - **colour / finish** ("White with warm white bulb", "Matt black"; suggested from finishes already used) and **size** ("90 mm cut-out"), both optional;
  - **link**, the product's web page (spec sheet, the maker's page);
  - **trade**, **family**;
  - **picture:** one main photo (a `StoredFile`), or a **colour swatch** (a colour picked or typed as a hex code) for paint and other finishes with no product photo;
  - **notes** (shown on the handover sheet when wanted, e.g. "IP44");
  - `deletedAt`.
- **Trade** uses the same trades as the plan icons (Electrical, Data & comms, Plumbing, HVAC, Fire, Security, Gas, Solar & batteries) plus **Other**. It decides the material's group on the handover sheet.
- **Where it lives:** Settings › Materials (`/materials`), a list with search, a trade filter and a brand filter, like the price book. Add or edit a material in a sheet; take or pick the photo there.
- **Adding on the fly:** anywhere a material is picked (price book, a job's handover list), "Add a new material…" opens the same sheet with the typed name filled in.
- **Unique:** Grid warns when a new material has the same brand, model and finish as one already in the list ("Already in Materials: open it?"), but doesn't block it.
- **Permissions:** `materials.view`, `materials.manage`. Owner and Foreman: both. Employee and Viewer: view.
- **Stored for later now:** `catalogueModelId?`, the link to the server-wide product catalogue planned in `documents-block.md` (Manufacturer → Family → Model). Unused until that's built.

### The price book adds the money

- A price book **material** item now points at a material (`PriceItem.materialId`) and takes its name, brand and photo from it. The price book keeps what's about buying and selling: cost, sell, markup, unit, tax code, supplier and supplier code.
- **Labour** items stay in the price book only (labour isn't a material).
- **Moving existing data:** the migration makes a material for each existing material item (name, brand) and links them. `PriceBrand` becomes the Materials Brands list (same ids, so nothing is lost). Quotes already sent keep their own copies of line text, as now.
- In the price book, adding a material item starts from "Pick a material" (or "Add a new material…").

## 2. The job's handover list (Handover Block)

- A **Handover** section on the job page (and its own page, `/handover/<job>`) lists what's installed, **grouped by trade, then by room**.
- **Each line:** a material, a room, a quantity (optional), and a note for this job ("Dimmer on the left").
- **Rooms are typed per line** (Kitchen, Ensuite, Garage…), suggesting rooms already used on that job. Lines with no room go under **General** in their trade. When Grid gets zones inside levels (`stage-2-projects.md`), rooms can move onto them.
- **Each room on its own page** is a switch per job (§3).
- **Show quantities** is a switch per job: on, the list and the PDF have a Qty column; off, they don't. The quantities stay stored either way.
- **Cover:** a switch, the title for this job, and the cover picture (one of the job's photos, or upload one).
- **Where lines come from (a mix):**
  - **Pick from Materials** (search, or by trade and brand), or "Add a new material…".
  - **Bring in from plans:** plan icon numbers whose price book item is linked to a material come in with their counts per level. Room is left blank to fill in. Running it again shows what changed ("Plans now have 26, the list has 24: Update?") and never overwrites lines changed by hand.
  - **Bring in from the accepted quote:** quote lines from price book items linked to a material.
- **Sort:** trades in the fixed order above; rooms in the order you drag them (first used first, by default); items by name within a room.
- **Permissions:** `handover.view`, `handover.edit`, `handover.share`. Owner and Foreman: all three. Employee: view and edit. Viewer: view. While solo, it's just you.
- Every change writes the audit log (entity `HandoverItem`, `HandoverSettings`).

## 3. The handover PDF

Modelled on the owner's example (a builder's printed "Fixtures + Finishes Schedule"): plain white paper, black ruled table, small capitals for headings, centred text. It reads well printed and bound.

- **Landscape A4**, built with `renderPdf(await toHtml(<Doc/>))` and the business's Branding (templates Block), like quotes. Shown in the app with `PageViewer` (never a new tab), with **Download** and **Email to client**.
- **Cover page** (a switch per job, on by default):
  - the title, "Fixtures & Finishes Schedule" by default, changeable per business (in the Handover settings) and per job;
  - the job name and site address ("Warrawee – Le Roy"), the client;
  - a **cover picture**, picked from the job's photos or uploaded (a photo of the house, or the designer's front elevation); none leaves the space empty;
  - the business logo (top right), web address (bottom left) and **Date prepared** (bottom right, e.g. "20 July 2025").
- **Sections and rooms.** The list is grouped by trade, then by room. Every page has a header block:
  - **JOB:** the job name and address;
  - **SECTION:** the trade ("Lighting & Electrical"). The trade's printed name can be changed per business (e.g. Electrical prints as "Lighting & Electrical").

  For a single-trade business (the usual case now) that's one section, and the **rooms are the groups**. Each room is a full-width divider row across the table ("KITCHEN", "ENSUITE"), with its own materials under it. **Each room on its own page** is a switch per job (off by default: rooms follow on). Lines with no room come first, under **GENERAL**. When the list has more than one trade, each trade starts on a new page.
- **Columns belong to the trade.** Each trade has its own column layout, defined in code (`handover/columns.ts`), so trades can differ as in the builder's example. Now every trade uses the **product layout** below; finish layouts such as paint (Walls / Trims / Ceiling per room) are added when a trade needs them. A business can hide the optional columns (Link, Notes) per trade in the Handover settings.
- **The product layout:**

  | Item | Image | Product | Colour / finish / size | Qty* | Link | Notes |
  |---|---|---|---|---|---|---|
  | Downlights | photo | Beacon Lighting – Masson Accent Minitrim… (brand – name, model underneath) | White with warm white bulb | 12 | LINK | |

  - **Item** is the item type; **Image** the photo or the colour swatch, fitted in a box about 40 mm wide; **Product** is brand – name, with the model on the next line.
  - *Qty only when Show quantities is on. A line with no quantity prints **TBC**.
  - **Link** prints "LINK" and opens the material's web page when the PDF is tapped or clicked; empty when there's no link.
  - **Notes** is the job line's note, then the material's notes. The column is left out when no line in the PDF has one.
  - A row never splits across pages. When a room runs onto the next page, its divider repeats as "KITCHEN (continued)", and the column headings repeat on every page.
- **Bottom of each page:** page x of y, business name and phone.
- The PDF is made on request and kept in `cacheRoot()` until the list changes.

### The client's link (decided Nov 2026)

Clients can open and download their handover sheet themselves, without Grid: a private link, `/h/<token>`, made the same way as plan share links (`plans-block.md`, "Sharing plans").

- **Made from the job's Handover section** (Share with client) by anyone with `handover.share` (Owners and Foremen by default). **Email to client** sends this link (with the PDF attached too), and **Copy** gives it for a text message.
- **What they see:** the business's logo and details, the job and site address, and the list as on the PDF (by trade, then room, with photos), on a page that suits a phone. **Download PDF** gets the same landscape PDF. Nothing to change.
- **Always the current list.** Changes after sharing show on the link; the page says when it was last updated.
- **It keeps working after the job is archived**: handover is usually the end of the job, and clients look things up years later (which downlight, what finish to match). It's built from the materials' photos (originals), not the job's dropped viewing copies.
- **How long it works:** no end by default; 30 or 90 days, or 1 year, can be picked instead.
- **It stops working** when it's turned off (for good; make a new one to share again), runs out, when the job or the business is deleted, or when the business turns the Handover Block off. Anything wrong shows the same "This link isn't working" page.
- **Managing:** the link shows when it was last opened and how many times, with Copy and Turn off.
- **Data:** `HandoverShare`: `companyId`, `projectId`, the token stored hashed (to find it) and encrypted (to show the link again), `clientId?`, `expiresAt?`, `revokedAt?`, `lastOpenedAt?`, `openCount`, `createdById`, `createdAt`. Public API at `/api/public/handover/h/<token>/…` checks the token on every request and only reaches that job's handover list, its PDF and its materials' photos. Making and turning off a link go in the activity log.
- **Later:** a QR code on the printed PDF that opens the link.

## 4. Data

- `MaterialBrand` (was `PriceBrand`): `companyId`, `name`, `deletedAt`.
- `MaterialFamily`: `companyId`, `name`, `brandId?`, `deletedAt`.
- `Material`: `companyId`, `name`, `itemType?`, `brandId?`, `familyId?`, `model?`, `finish?`, `size?`, `link?`, `trade`, `photoFileId?`, `swatch?` (hex colour), `notes?`, `catalogueModelId?`, `createdAt`, `updatedAt`, `deletedAt`.
- `PriceItem.materialId?` (quotes).
- `HandoverItem`: `companyId`, `projectId`, `materialId`, `trade` (copied from the material when added, so a builder's combined schedule can group it later), `room?`, `qty Decimal?`, `note?`, `source` (`MANUAL | PLANS | QUOTE`), `sourceRef?` (the icon number or quote line it came from), `editedByHand Boolean`, `sort`, `createdAt`, `updatedAt`.
- `HandoverSettings` (per job): `projectId`, `companyId`, `showQty Boolean @default(true)`, `roomPerPage Boolean @default(false)`, `roomOrder String[]`, `cover Boolean @default(true)`, `title?` (blank uses the business's), `coverFileId?`.
- `HandoverCompanySettings` (per business): `companyId`, `title` (default "Fixtures & Finishes Schedule"), `tradeNames Json` (printed names per trade), `tradeColumns Json` (hidden optional columns per trade).
- `HandoverShare` (§3, the client's link).
- Clean-up hooks: Materials `purgeCompany` and `companyUsage` (photos); Handover `purgeProject`, `purgeCompany`, and `jobStorage` for its cached PDFs.

## 5. Build order

1. **Materials core:** the list, brands and families, photos; the price book moved onto materials, with the data migration. **Done**, see "What part 1 built".
2. **Handover Block:** the job's list (pick, rooms, quantities switch, swap finish), the landscape PDF, and the client's link.
3. **Bring in from plans and from the accepted quote.**

### What part 1 built (Nov 2026)

- **The `materials` Block** (`blocks/materials`, core): Settings › Materials at `/materials` (icon `package`), with search (name, type, brand, model, finish, family), trade chips (only trades in use) and brand chips with **Edit brands**. Each material has its own page, `/materials/<id>`, with its details, picture and **Other finishes** (the rest of its family).
- **The material form** (`MaterialSheet`): Photo or Colour (a colour picker plus a typed code), name, item type, trade (starting with the business's own trade, `tradeForCompany`), brand (with "Add a new brand…"), model, colour / finish, size, family, link (typed without `https://` is fine) and notes. Item types, finishes and families are suggested from what's already used. A family is found by name or made. Saving a material that has the same brand, model (or name, without one) and finish as another shows "Already in Materials" with **Open it** and **Save anyway**.
- **Removing a material** hides it from the list and pickers; it keeps its photo for price book items and jobs that use it. Its photo is readable by anyone in the business with `materials.view`.
- **Routes** at `/api/materials`: list (`q`, `trade`, `brand`, `family`), `suggestions`, `same`, `brands` (moved from `/api/quotes/brands`), and a material by id. Events: `materials.changed` (`MaterialChangedEvent`) when a material is saved.
- **For other Blocks:** `@grid/block-materials` (`listMaterials`, `materialsById`, `materialIdsMatching`, `requireMaterial`, `listBrands`, trades and words) and `@grid/block-materials/components` (`MaterialPicker`, `MaterialSheet`, `MaterialPicture`, `BrandChips`).
- **The price book:** a material item picks its material (**Pick a material**, with "Add a new material…" for anyone with `materials.manage`) and shows its photo; its name follows the material ("Iconic double switch, White"), kept in step through `materials.changed`. Labour is unchanged. The price book's brand chips filter by the material's brand; brands are edited in Materials. Quotes now depends on Materials.
- **The migration** (`20261124090000_materials`) copied `PriceBrand` into `MaterialBrand` (same ids), made a material for every material item (same id as the item, its name and brand, in the business's trade; removed items became removed materials), linked them, then dropped `PriceItem.brandId` and `PriceBrand`.
