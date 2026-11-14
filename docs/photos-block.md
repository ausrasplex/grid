# Photos & notes block (`photos`)

Status: **built** (phase 2b-lite, November 2026). An optional Block, on in the sole-trader starting set; add it from the Store for older businesses.

## What it does

- **Photos and notes on a job**, filed against the area they're about: a level, a building, or the whole job. A house job has one area, so nobody is asked.
- **Before / After tags** on photos, with filter tabs and counts on the job page.
- **On the job page** (a `job.area` panel): "Photos & notes" for the area you're in, or the whole job. Newest first, grouped by day; runs of photos show as a grid, notes as cards between them.
- **Viewer:** full screen, swipe or arrow keys, caption, tag, area, who and when; download the full-size photo; edit or delete your own (Foreman and Owner can change anyone's).
- **Photo report** (`/b/photos/report/<job>`): Before, After and Other photos with captions and dates, for the customer or the CES. Print, or save as PDF from the print dialog. Prints without the app's menus.
- **Finished jobs are read-only** until reopened.

## Taking photos

- **Centre button:** for a sole trader with this Block on, the centre button is **Take a photo** (`docs/navigation.md` §5a). It opens a big **Open camera** button, or **Choose from your photos**.
- **Which job:** the job you're on now, or the one you used last. There's a one-tap change of job, then the area, Before/After and an optional caption. The same caption goes on every photo in a batch.
- **From a job page:** **Add photos** lets the phone offer camera or library, and files them against the area you're looking at.

## Without signal

- **Saved on the phone first.** Photos go into an outbox on the phone (IndexedDB) before anything is sent.
  - They upload one at a time, whenever there's signal: on opening the app, on coming back online, and every 30 seconds.
  - Basements and plant rooms lose nothing.
- **Shown while waiting.** On the job, photos still on the phone appear under **On this phone** marked Waiting / Uploading. A bar says "3 photos saved on this phone, waiting for signal".
- **Never twice.** Each photo's id is made on the phone, so a retry after a dropped connection never makes a second copy. A file uploaded before the connection dropped is reused.
- **If the server says no** (for example, the job was finished meanwhile), the photo stays on the phone, marked "Not saved", with **Try again** or **Remove**.
- **Smaller before sending.** The phone shrinks photos to 2560 px on the long edge before storing or sending them, and turns iPhone HEIC photos into JPEG. A typical upload is 1–3 MB.
- **What's left for phase 6:** the app pages themselves don't open offline yet (that needs the offline app). On the capture screen, saving without signal keeps you there, ready for the next photo.

## Files (core, used by later Blocks too)

- **Storage:** `StoredFile` table plus files on disk under `FILES_ROOT` (`<company>/<yyyy>/<mm>/<id>.jpg`). Each image gets two copies on upload with sharp: `thumb` (480 px) and `display` (2048 px), turned upright from the camera's orientation.
- **Upload:** `POST /api/files` (multipart, JPEG/PNG/WebP, 25 MB at most). The file belongs to nobody until a Block attaches it with `attachFile()`. Only the uploader can attach it, and only once.
- **Download:** `GET /api/files/<id>?v=thumb|display|original`. The owning Block's `fileAccess` check decides who may see it. Anyone else gets "not found". Files never change, so phones cache them.
- **Clean-up:** see "Storage clean-up" below.

## Storage clean-up (built, phase 2c)

Two kinds of leftover files build up, and a clean-up handles both every night (2:30 am by default, server time).

### What it removes

1. **Unfiled uploads.** A photo can reach the server but never get filed against a job: the signal dropped between the two steps, then the photo was removed from the phone. These are removed after **7 days** (setting). If a phone comes back even later, the server answers "410 file gone" and the phone simply uploads the photo again from its own copy, so nothing is lost.
2. **Recently deleted.** Deleting a photo or note hides it straight away. For **30 days** (setting) it can be restored. After that the file and its smaller copies are removed from disk. The rows stay, marked purged, so the activity log still shows who added it, who deleted it and when.
3. **Stray files, weekly.** Files on disk that the database doesn't know about are removed, if they're more than a day old: a crash part-way through an upload, or left-over `.tmp` files. "Run clean-up now" always includes this check.

**Never removed automatically:** photos on jobs, including finished and archived ones. Photos in a sent or signed document stay with that document (phase 3).

### Settings › Storage

- **Who sees it:** Owners and Foremen (`companies.storage.manage`).
- **Recently deleted:** each business's deleted photos (with thumbnails) and notes. Each row shows the job, who deleted it and when, its size, and **"Removed for good in N days"**. Select some or all, then **Restore** (back where they were on the job) or **Delete now** (gone for good straight away).
- **Unfiled uploads:** thumbnail, who uploaded it and when, size, and when it'll be removed. Select, then **Delete now**.
- **Clean-up history:** every nightly run, "Run clean-up now" and "Delete now". Each shows when it ran, who ran it, how many items and how much space. Tap a run to see each item ("Photo "Old fuse board" on Add 4 power points (J-1002), deleted by Jesse on 7 Nov · 79 KB"). Dry runs are marked and list what would have gone. A business sees runs that touched its own things; the server admin can switch to the whole server.
- **Server admin only:**
  - **Space used:** per business and in total, plus free space on the files share.
  - **Clean-up settings:** remove unfiled uploads after N days; keep Recently deleted for N days (both 1–365); clean-up On, Dry run or Off; the time it runs.
  - **Run clean-up now.**
- **When it's not On:** a banner says the clean-up is in dry-run mode or switched off.

### How it runs

- **Scheduled jobs:** **pg-boss** (queue in the same Postgres, schema `pgboss`), started in `instrumentation.ts`, inside the app container. A tick every 15 minutes runs the clean-up once the set time has passed and it hasn't run since. A server that was off at 2:30 therefore catches up when it starts.
- **Turning it off:** `JOBS=off` turns the runner off (e.g. a second app container).
- **One at a time:** a run that's still going blocks a second one. A run that never finished (server stopped) stops blocking after 30 minutes.
- **Each Block purges its own:** the clean-up asks every Block with a `cleanup` hook to purge what's past Recently deleted. Photos is the first; plans and documents will add theirs.
- **Settings:** stored in `ServerSetting` (key `storage`) and changed only in the app; a new server starts at 7 days, 30 days, On, 02:30. They're deliberately not environment variables. The template's `TZ` makes the time local.

### Data

- `StoredFile.purgedAt`.
- `JobPhoto` / `JobNote`: `deletedById`, `purgedAt`, `restoredAt`, `restoredById`.
- `ServerSetting`.
- `CleanupRun`: trigger, mode, who, when, summary, error.
- `CleanupItem`: business, kind, label, size, applied or dry run.

## Data

- `JobPhoto`: `id` (from the phone), `projectId`, `companyId`, `buildingId?`, `levelId?`, `fileId`, `caption?`, `tag` (`NONE | BEFORE | AFTER`), `visibility` (`PRIVATE | SHARED`, default PRIVATE), `takenAt` (from the phone), `takenById`, `deletedAt`, and the photo pin (4b): `planSheetId?`, `planX?`, `planY?`.
- `JobNote`: `projectId`, `companyId`, area, `body`, `visibility`, `createdById`, `deletedAt`.
- **Visibility** is stored now (roadmap rule 6). Others on a job only see SHARED records. The choice appears once there's a contract chain (2b).
- **Permissions:**
  - `photos.view`: everyone.
  - `photos.add`: Employee and up; includes changing your own.
  - `photos.manage`: Foreman and Owner; change anyone's.

## Later

- **Custom report templates:** the built-in report becomes one of several templates a company can design in the templates Block (`docs/templates-block.md`, "Report templates").
- ~~Photo pins on plans~~: built in 4b (`docs/plans-block.md`, "Photo pins"). Moving a pin is still to come.
- **On the site page:** photos on earlier jobs at an address.
- **Quotes:** attaching photos to quotes (phase 3).
- **Team members checked in to a site** get Photo in the Actions menu (phases 7–8).
