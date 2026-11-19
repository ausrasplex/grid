# Plans block

Status: **4a and 4b built** (November 2026): upload, sheets, revisions, deep-zoom viewer (4a); markups, photo pins and calibrated measuring (4b, see "What 4b built"). Block id `plans`, depends on `projects`. Optional (in the Store); the solo preset turns it on. Markups and measuring are their own Block, `markups` (depends on `plans`); photo pins belong to `photos`.

## How plans arrive

Plans usually come as **one PDF per sheet**, downloaded from the builder's system (Procore, Aconex) or an email. Grid also takes a whole set in one PDF (one sheet per page) and images (PNG, JPEG, WebP: a photo of a printed plan). Uploads go through `/api/files`, which now accepts PDFs up to 150 MB (`saveDocumentUpload`); photos are still 25 MB.

## Upload and review

1. Pick files on the job's Plans page (`/plans/job/<projectId>`). Each uploads with a progress bar.
2. Grid reads each page (`POST /api/plans/job/<id>/preview`): sheet number, title and revision from the **file name** (`E-101 Lighting Layout Rev C.pdf`, `E101_C_…`, `1234-ELE-DWG-E101[C].pdf`, `SK-E-01-P2.pdf`), and from the **title block** text (`pdftotext` of the bottom-right corner, then the whole page) to fill gaps. In a multi-page set the title block names each page. `parse.ts` is pure and unit-tested.
3. Each page is matched to the job's sheets by number: **New sheet**, **New revision of E-101 (now Rev B)**, or **Skip** (same file, or that revision is already there). You can fix the number, title and revision before saving.
4. `POST …/import` files the uploads, makes sheets and versions, makes each new upload current, and queues `plans.render` for each.

The discipline comes from the number's letters (E Electrical, M Mechanical, H Hydraulic, A Architectural, S Structural, F/FP Fire, SK Sketches…) and sets the list order and the filter chips.

## Rendering and the viewer

- `plans.render` (a background job: blocks can now declare `jobs` in their manifest, run by pg-boss) renders the page with poppler's `pdftoppm` at the sheet's **sharpness level** (below; Medium is up to 250 dpi capped at 48 megapixels: A1 ≈ 248 dpi, A0 ≈ 175 dpi), then cuts it into 512 px deep-zoom tiles with sharp, plus a thumbnail. About 6 seconds for an A1 sheet at Medium.
- Tiles live in `<files>/.cache/plans/<versionId>/` (`plan.dzi`, `plan_files/`, `thumb.jpg`). They can always be made again from the original, so **backups and the stray-file sweep skip `.cache`**.
- Served by `GET /api/plans/tiles/<versionId>/<width>/…`, checked against the job (cached for a minute per person and version), and cached by the browser forever. The rendered width is in the address, so a sheet drawn again at another level gets new addresses and phones don't keep the old tiles. (The old `/tiles/<versionId>/…` addresses still work.)
- **Sharpness (built Nov 2026).** Four levels (`packages/db/src/render-levels.ts`, unit-tested): **Low** 200 dpi (up to 32 MP), **Medium** 250 dpi (48 MP, the standard and what Grid always did), **High** 300 dpi (72 MP), **Extreme** 500 dpi (200 MP). A sheet too big for the level's megapixel limit is drawn a little softer, so a huge sheet can't run the server out of memory (A0 at Extreme ≈ 359 dpi). Rough disk per A1 sheet: 4–6, 6–10, 9–14 and 25–45 MB; Extreme can take a few minutes and up to 1 GB of memory per sheet. Higher levels cost the server, not the phone: tiles mean a phone only loads what's on screen.
  - **The server's level** is set by the server admin in **Settings › Plans & PDFs** (`ServerSetting` "rendering", not an environment variable: a day-to-day setting). New uploads use it. **Redraw plans** there queues `plans.rerender`, which draws every showing revision again in the background (`again`: it stays viewable, and a failure keeps the old tiles). Sheets with their own level are left alone.
  - **A sheet's own level:** **Sheet details › Sharpness** (`plans.manage`): Server setting, or Low/Medium/High/Extreme for that sheet (`PlanSheet.quality`, null = the server's). For the odd sheet with tiny text (a switchboard schedule, a riser). Changing it draws every revision of the sheet again; it shows "getting ready" until done. Written to the activity log.
  - **Markups, photo pins and scales don't move:** they're in sheet units, not pixels, so a different level only changes how sharp the drawing underneath is.
- The viewer (`/plans/sheet/<sheetId>[/<versionId>]`) is OpenSeadragon, full screen: pinch, drag, double-tap, zoom buttons, previous/next sheet in set order, a sheet picker, and the revision chip. Viewing an older revision shows an amber "Not the current revision" bar.

## Sheets and revisions

- `PlanSheet`: number, title, discipline, optional building/level (so the job page offers it on that level), current version, soft delete (Recently deleted, purged by the storage clean-up: "Deleted plan sheet").
- `PlanVersion`: revision label, the uploaded file and page, render status (PENDING, READY, FAILED with the reason and **Try again**), pixel size, dpi and the PDF page size in points (for measuring in 4b).
- Revisions: newest upload is current; **Make current** picks another; **Remove** deletes a revision uploaded by mistake (not the last one). The original file downloads from each revision.
- The job page's `job.area` panel shows "Plans · N sheets", the sheets for the level you're on, else the latest.

## Permissions

`plans.view` (everyone), `plans.upload` (Owner, Foreman), `plans.manage` (rename, delete, current revision: Owner, Foreman). `plans.layers` (add layers: Owner, Foreman, Employee). `plans.share` (share links: Owner, Foreman).

## What 4b built

### How Blocks draw on a plan (the plan overlay)

- The viewer renders every switched-on Block's `plans.viewer` panel over the sheet (props: `PlanViewerPanelProps`: the sheet and the job name). Markups and Photos each add one, so neither depends on the other, and Photos doesn't depend on Plans.
- The overlay lives in `@grid/ui` (`plan-overlay.tsx`): `usePlanOverlay()` gives the view, the revision being viewed, every revision, the tool in use and a tool-bar slot; `usePlanPointer()` gets taps and strokes; `<PlanLayer>` is an SVG layer in sheet units; `<PlanToolButton>` adds a button to the bar under the plan (`order` sorts Blocks' buttons together).
- **Sheet units:** x runs 0 → 1 across the sheet's width, y runs 0 → height/width down it (OpenSeadragon's viewport units). They don't depend on zoom or on a revision's pixel size, so markups and pins land in the same spot on every revision.
- **Tools:** pick one in the bar and draw with **one finger**; **two fingers still move and zoom** (the viewer stops a one-finger drag from panning only while a tool is picked). **Tools that only use taps** (Icons, Photo pins, Text, Length, Area and setting the scale) leave a one-finger drag panning the plan, so you can move to the next spot without putting the tool down (`setTool(tool, { tapsOnly: true })`; decided Nov 2026 after testing icons). Pen, highlighter, shapes, arrows and clouds still draw with the drag. **Snap to 45° (decided Nov 2026):** hold **Shift** while drawing a Line or Arrow, or tapping Length, Area or scale points, and the line snaps flat, upright or diagonal (`snapAngle()` in `geometry.ts`, unit-tested). Phones and tablets have no Shift, so the tool card has a **45°** button that keeps snapping on until it is tapped again. With no tool picked, a tap picks a markup. Esc puts the tool down. The **eye** button (with the zoom buttons) hides markups and pins.

### Markups (`markups` Block)

- Tools: **Pen, Highlight, Text, Arrow, Line, Box, Circle, Cloud, Length, Area**, plus **Set scale**, **Colour** (red, blue, green, yellow, pink, black; thin, medium, thick) and **Undo** (Ctrl+Z on a keyboard). Ink colours are data on the drawing, not theme colours.
- Lines and text keep the size they had **on screen when drawn** (stored in sheet units), like ink on paper: zoom in and they get bigger.
- Tap a markup to see who drew it and when (and "from Rev B" when it carried over), change its colour, change its text, make it **Just me** (hidden from the rest of the business; not offered while solo) or delete it. Yours, or anyone's for Owner and Foreman (`markups.manage`).
- **Revisions (decided):** markups **carry over to newer revisions** (Rev B's markups show on Rev C), not back to older ones. You draw on the **current revision only**; older ones are for looking.
- **Who sees them (decided):** everyone in the business by default; **Just me** is the exception. `SHARED` (the contract chain) is stored for later and refused for now.
- Saved the moment they're drawn (the id is made on the device, so a retried save never doubles up). Deleting is soft, so Undo can bring it back.
- `PlanMarkup`: `id` (from the device), `companyId`, `projectId`, `sheetId`, `versionId` (drawn on), `kind` (`PEN | HIGHLIGHT | TEXT | LINE | ARROW | RECT | ELLIPSE | CLOUD | LENGTH | AREA`), `points` (JSON, sheet units), `color`, `size`, `text?`, `visibility` (`JUST_ME | COMPANY | SHARED`, default COMPANY), `createdById`, `updatedById?`, `deletedAt?`.
- Permissions: `markups.view` (everyone), `markups.add` (Employee and up: draw, measure, set the scale, change your own), `markups.manage` (Owner, Foreman: change or delete anyone's).
- The migration switches Markups on for every business that already had Plans on.

### Measuring

- **Length:** tap along the run, **Done** (or double-tap). **Area:** tap each corner, **Done**. **Drag a point to move it**, while drawing (before Done) or afterwards: tap the saved area or length and drag its round handles (yours, or anyone's for Owner and Foreman; Undo puts it back). A press on a handle takes the drag, so the plan doesn't pan (`PlanPointer.claim()` in the overlay). The running total shows as you go; labels stay readable at any zoom. Under 1 m reads in mm (`820 mm`), then `12.40 m`; areas in m².
- **Scale, per revision**, two ways:
  - **Drawing scale** (PDFs only): pick 1:20 / 1:50 / 1:100 / 1:200 / 1:500 or type one. Grid knows the PDF's paper size (it says "This PDF is A1"), so 1:100 means 1:100 on that paper. A plan marked "1:100 at A1" printed to A3 is 1:200.
  - **Measure something you know:** tap both ends of a known length (a door, a grid spacing, a written dimension) and type it in metres or millimetres. The only way for picture uploads.
- A revision without its own scale **uses the last one set on an earlier revision** and says so in amber ("Scale from Rev B: check it").
- Picking Length or Area before there's a scale opens Set scale first.
- `PlanScale` (one per revision): `versionId`, `companyId`, `sheetId`, `metresPerUnit` (real metres per sheet width), `method` (`RATIO | POINTS`), `ratio?`, `points?`, `knownMetres?`, `setById`.
- The maths (`blocks/markups/geometry.ts`: lengths, areas, clouds, picking, paper sizes, scale carry-over, typed lengths) is pure and unit-tested.

### Photo pins (`photos` Block)

- **Photo** in the tool bar, tap the spot, then **Take photo** or **Choose**. Photos go through the normal offline outbox: the pin shows dashed straight away and fills in once sent. They're ordinary job photos too (filed at the sheet's level, captioned "On E-101").
- The "Pin a photo here" card has a **Note** box; tap a pin to read and add dated notes on each photo (`docs/photos-block.md`, "Notes on a photo").
- Photos at the same spot share one pin with a count. Tap a pin for its photos, **Take another** / **Add from phone** at that spot, **Unpin** (keeps the photo, takes it off the plan) or **Delete** (the photo goes to Recently deleted, like deleting it from the job's photos; restorable from Settings › Storage). Both only for whoever took it or `photos.manage`.
- Pins belong to the sheet, not a revision, so they show on every revision.
- `JobPhoto` gained `planSheetId?`, `planX?`, `planY?`. `GET /api/photos/pins/<sheetId>?job=<projectId>`; `POST /api/photos` and `PATCH /api/photos/<id>` take `pin` (`null` unpins).

## Layers (decided and built Nov 2026)

Electricians keep Power, Data and Lighting apart; plumbers draw Water and Drainage on separate layers.

- **Per sheet.** Every sheet has **Default**, which has no row: anything with no layer, including everything drawn before layers existed, is on it, so no data changed. People add more layers per sheet (`PlanLayer` in the `plans` Block). Names are unique on a sheet, and "Default" is taken.
- **Everything goes on a layer:** markups (`PlanMarkup.layerId`), trade icons (they're markups) and photo pins (`JobPhoto.planLayerId`). New things go on the layer you're **drawing on**, picked in the Layers panel. A chip at the bottom left shows it once a sheet has layers. A selected markup or icon has a **Layer** picker to move it.
- **On and off is per person,** remembered on the device (localStorage per sheet). The eye in the panel hides a layer just for you; the Layers button shows how many you've turned off. Picking a hidden layer to draw on turns it back on. Hide markups (the eye with the zoom buttons) still hides everything, and icon trade show/hide stays. Counts and take-offs count every layer.
- **Who:** `plans.layers` (Owner, Foreman and Employee by default: the people who can draw) adds layers and renames or deletes their own; `plans.manage` changes anyone's. Adding layers is offered on the current revision only.
- **Deleting a layer** deletes nothing on it: Plans emits `plans.layerDeleted`, and Markups and Photos move what was on it back to Default. Until then, a layer that's gone counts as Default anyway.
- **How Blocks use it:** the plan overlay (`@grid/ui`) gives `activeLayerId`, `layerShown(layerId)` and `layers`. A Block saves `activeLayerId` on what it adds and draws only what `layerShown` allows. Markups checks that a layer belongs to the sheet (`checkLayer` from `@grid/block-plans`); Photos doesn't depend on Plans, so it just keeps the id.
- Later: layers shared across a job's sheets and a layer's own colour. (Downloading chosen layers as a PDF is done: "Plan PDFs" below.)

## Plan PDFs (decided and built Nov 2026)

- **Download PDF** in the viewer (the download button in the header) gives the revision you're looking at, with the layers you tick drawn on. It starts with the layers you have showing; untick them all for the clean drawing. Anyone who can see plans can download; the markups only go on if they can see markups.
- **Built from the original upload, never the zoom tiles.** The sheet's page is copied straight out of the uploaded PDF, so the drawing stays sharp at any zoom and its text can still be searched. An image plan becomes a page the image's size (150 dpi).
- **The layers are a see-through page laid over it.** Each Block with something to draw adds a `planDrawing` hook (core `PlanDrawingInput`): Markups draws its markups, measurements (with the revision's scale) and icons, using the same pieces as the live viewer (`blocks/markups/ui/shapes.tsx`). Chromium (the quote PDF renderer, `renderPdf` with `page`) turns that into a PDF page the size of the sheet as seen; it's laid over the drawing, turned to undo the page's own rotation (`blocks/plans/placement.ts`, tested). The whole media box shows, as the tiles do.
- Never included: "Just me" markups (not even your own) and photo pins.
- Plans now depends on Templates (core) for Chromium.

## Sharing plans (decided and built Nov 2026)

A private link to some of a job's sheets, for someone without Grid (a builder's site office, a client, a supplier): `/s/<token>`.

- **Made on the job's Plans page** (Share links, below the sheets) by anyone with `plans.share` (Owners and Foremen by default). Each link has: who it's for, the **chosen sheets** (all ticked to start), the **layers** whose markups and icons go with it (picked by name across the chosen sheets: Default, Power, Data…; none for the clean drawing), **how long it works** (7, 30 or 90 days, or no end) and whether it **can download a PDF** (on by default).
- **Always the current revision.** A new revision of a shared sheet shows on the link without a new link. The page says the revision and its date.
- **What they see:** the business and job name, the sheets (thumbnails), and a zoomable viewer like Grid's, with the chosen layers drawn on and nothing to change. Download PDF per sheet and "Download all as PDF" (the same builder as above), if allowed. Never "Just me" markups or photo pins. Layers added to a sheet later aren't on an existing link.
- **Managing:** each link shows its sheets, layers, end date, when it was last opened and how many times; **Copy** and **Turn off**. Turning off is for good (make a new one to share again); it stops working at once, and tiles already loaded stop within a minute. Turned-off and run-out links stay listed (folded away) for 90 days.
- **It stops working** when it runs out or is turned off, while the job is archived (its tiles are dropped), when the job or the business is deleted, or when the business turns Plans off. A sheet deleted from the job drops off the link. Anything wrong shows the same "This link isn't working" page.
- **Data:** `PlanShare` (the token stored hashed to find it and encrypted to show the link again, like invite links; sheet ids, layer ids and `withDefault`, `allowDownload`, `expiresAt`, `revokedAt`, `lastOpenedAt`, `openCount`). Public API at `/api/public/plans/s/<token>/…` checks the token on every request and only reaches the link's sheets at their current revision. Making and turning off a link go in the activity log. Removed with the job or the business.

## Not yet

- Moving or resizing a markup after it's drawn (delete and redraw for now); markup icons (GPO, switchboard…) and counts for take-offs (`docs/quotations-block.md` §4); a list of a sheet's measurements with totals.
- Markups made offline (they need signal for now; full offline is phase 6). Moving a photo pin.
- Comparing two revisions (overlay), sheet search in Jump To, a QR on printed sheets, offline copies of sheets, company layers and sharing with the contract chain (2b).
