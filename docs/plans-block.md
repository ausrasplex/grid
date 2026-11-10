# Plans block

Status: **4a built** (November 2026): upload, sheets, revisions, deep-zoom viewer. **4b next:** your own markup layer (pen, highlighter, text, shapes, arrows, clouds), photo pins, calibrated measuring (length and area). Block id `plans`, depends on `projects`. Optional (in the Store); the solo preset turns it on.

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

## Not yet

- 4b: markups, photo pins, calibrate and measure.
- Comparing two revisions (overlay), sheet search in Jump To, a QR on printed sheets, offline copies of sheets, company layers and sharing with the contract chain (2b).
