# Plans block

Status: **4a and 4b built** (November 2026): upload, sheets, revisions, deep-zoom viewer (4a); markups, photo pins and calibrated measuring (4b, see "What 4b built"). Block id `plans`, depends on `projects`. Optional (in the Store); the solo preset turns it on. Markups and measuring are their own Block, `markups` (depends on `plans`); photo pins belong to `photos`.

## How plans arrive

Plans usually come as **one PDF per sheet**, downloaded from the builder's system (Procore, Aconex) or an email. Grid also takes a whole set in one PDF (one sheet per page) and images (PNG, JPEG, WebP: a photo of a printed plan). Uploads go through `/api/files`, which now accepts PDFs up to 150 MB (`saveDocumentUpload`); photos are still 25 MB.

## Upload and review

1. Pick files on the job's Plans page (`/b/plans/job/<projectId>`). Each uploads with a progress bar.
2. Grid reads each page (`POST /api/plans/job/<id>/preview`): sheet number, title and revision from the **file name** (`E-101 Lighting Layout Rev C.pdf`, `E101_C_…`, `1234-ELE-DWG-E101[C].pdf`, `SK-E-01-P2.pdf`), and from the **title block** text (`pdftotext` of the bottom-right corner, then the whole page) to fill gaps. In a multi-page set the title block names each page. `parse.ts` is pure and unit-tested.
3. Each page is matched to the job's sheets by number: **New sheet**, **New revision of E-101 (now Rev B)**, or **Skip** (same file, or that revision is already there). You can fix the number, title and revision before saving.
4. `POST …/import` files the uploads, makes sheets and versions, makes each new upload current, and queues `plans.render` for each.

The discipline comes from the number's letters (E Electrical, M Mechanical, H Hydraulic, A Architectural, S Structural, F/FP Fire, SK Sketches…) and sets the list order and the filter chips.

## Rendering and the viewer

- `plans.render` (a background job: blocks can now declare `jobs` in their manifest, run by pg-boss) renders the page with poppler's `pdftoppm` at up to 250 dpi, capped at 48 megapixels (A1 ≈ 250 dpi, A0 ≈ 175 dpi), then cuts it into 512 px deep-zoom tiles with sharp, plus a thumbnail. About 6 seconds for an A1 sheet.
- Tiles live in `<files>/.cache/plans/<versionId>/` (`plan.dzi`, `plan_files/`, `thumb.jpg`). They can always be made again from the original, so **backups and the stray-file sweep skip `.cache`**.
- Served by `GET /api/plans/tiles/<versionId>/…`, checked against the job (cached for a minute per person and version), and cached by the browser forever (a version never changes).
- The viewer (`/b/plans/sheet/<sheetId>[/<versionId>]`) is OpenSeadragon, full screen: pinch, drag, double-tap, zoom buttons, previous/next sheet in set order, a sheet picker, and the revision chip. Viewing an older revision shows an amber "Not the current revision" bar.

## Sheets and revisions

- `PlanSheet`: number, title, discipline, optional building/level (so the job page offers it on that level), current version, soft delete (Recently deleted, purged by the storage clean-up: "Deleted plan sheet").
- `PlanVersion`: revision label, the uploaded file and page, render status (PENDING, READY, FAILED with the reason and **Try again**), pixel size, dpi and the PDF page size in points (for measuring in 4b).
- Revisions: newest upload is current; **Make current** picks another; **Remove** deletes a revision uploaded by mistake (not the last one). The original file downloads from each revision.
- The job page's `job.area` panel shows "Plans · N sheets", the sheets for the level you're on, else the latest.

## Permissions

`plans.view` (everyone), `plans.upload` (Owner, Foreman), `plans.manage` (rename, delete, current revision: Owner, Foreman).

## What 4b built

### How Blocks draw on a plan (the plan overlay)

- The viewer renders every switched-on Block's `plans.viewer` panel over the sheet (props: `PlanViewerPanelProps`: the sheet and the job name). Markups and Photos each add one, so neither depends on the other, and Photos doesn't depend on Plans.
- The overlay lives in `@grid/ui` (`plan-overlay.tsx`): `usePlanOverlay()` gives the view, the revision being viewed, every revision, the tool in use and a tool-bar slot; `usePlanPointer()` gets taps and strokes; `<PlanLayer>` is an SVG layer in sheet units; `<PlanToolButton>` adds a button to the bar under the plan (`order` sorts Blocks' buttons together).
- **Sheet units:** x runs 0 → 1 across the sheet's width, y runs 0 → height/width down it (OpenSeadragon's viewport units). They don't depend on zoom or on a revision's pixel size, so markups and pins land in the same spot on every revision.
- **Tools:** pick one in the bar and draw with **one finger**; **two fingers still move and zoom** (the viewer stops a one-finger drag from panning only while a tool is picked). With no tool picked, a tap picks a markup. Esc puts the tool down. The **eye** button (with the zoom buttons) hides markups and pins.

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

- **Length:** tap along the run, **Done** (or double-tap). **Area:** tap each corner, **Done**. The running total shows as you go; labels stay readable at any zoom. Under 1 m reads in mm (`820 mm`), then `12.40 m`; areas in m².
- **Scale, per revision**, two ways:
  - **Drawing scale** (PDFs only): pick 1:20 / 1:50 / 1:100 / 1:200 / 1:500 or type one. Grid knows the PDF's paper size (it says "This PDF is A1"), so 1:100 means 1:100 on that paper. A plan marked "1:100 at A1" printed to A3 is 1:200.
  - **Measure something you know:** tap both ends of a known length (a door, a grid spacing, a written dimension) and type it in metres or millimetres. The only way for picture uploads.
- A revision without its own scale **uses the last one set on an earlier revision** and says so in amber ("Scale from Rev B: check it").
- Picking Length or Area before there's a scale opens Set scale first.
- `PlanScale` (one per revision): `versionId`, `companyId`, `sheetId`, `metresPerUnit` (real metres per sheet width), `method` (`RATIO | POINTS`), `ratio?`, `points?`, `knownMetres?`, `setById`.
- The maths (`blocks/markups/geometry.ts`: lengths, areas, clouds, picking, paper sizes, scale carry-over, typed lengths) is pure and unit-tested.

### Photo pins (`photos` Block)

- **Photo** in the tool bar, tap the spot, then **Take photo** or **Choose**. Photos go through the normal offline outbox: the pin shows dashed straight away and fills in once sent. They're ordinary job photos too (filed at the sheet's level, captioned "On E-101").
- Photos at the same spot share one pin with a count. Tap a pin for its photos, **Take another** / **Add from phone** at that spot, or **Unpin** (keeps the photo, takes it off the plan).
- Pins belong to the sheet, not a revision, so they show on every revision.
- `JobPhoto` gained `planSheetId?`, `planX?`, `planY?`. `GET /api/photos/pins/<sheetId>?job=<projectId>`; `POST /api/photos` and `PATCH /api/photos/<id>` take `pin` (`null` unpins).

## Not yet

- Moving or resizing a markup after it's drawn (delete and redraw for now); markup icons (GPO, switchboard…) and counts for take-offs (`docs/quotations-block.md` §4); a list of a sheet's measurements with totals.
- Markups made offline (they need signal for now; full offline is phase 6). Moving a photo pin.
- Comparing two revisions (overlay), sheet search in Jump To, a QR on printed sheets, offline copies of sheets, company layers and sharing with the contract chain (2b).
