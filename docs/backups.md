# Backups (core, phase 2d)

Status: **built** (phase 2d, November 2026). Server admin only, under Settings › Backups. Uses the scheduled-jobs runner from phase 2c.

**As built:**
- **Code:** `apps/web/src/lib/backups.ts`, the API in `apps/web/src/app/api/backups`, the page in `components/settings/Backups.tsx`, and the restore script `scripts/grid-restore.sh` (also in the image at `/app/grid-restore.sh`).
- **Settings:** in the app only (`ServerSetting` key `backups`). The template just has the Backups folder.
- **Checksum:** `manifest.json` carries a sha256 of `database.dump`, checked before a restore. Photos are checked by size only (re-reading every photo each night would be slow on a big share).
- **What a backup leaves out:** the pg-boss queue (`--exclude-schema=pgboss`; it rebuilds itself).
- **Restored-from backups are kept:** a backup restored from is marked done and kept. The database is dumped while its own backup is still "running", so start-up checks for a `manifest.json` before treating it as interrupted.
- **Scheduled vs manual:** scheduled and manual backups both count towards "keep the latest N". A smaller N applies as soon as it's saved.

## Settings › Backups

**What to include** (at least one):

| Choice | What's in it |
|---|---|
| **Database** | Every business, job, site, note, quote, user and setting. Small (MBs), quick. |
| **Media** | Photos and other files from the files share. Can be large (GBs). |

So a backup can be database only, media only, or both. Scheduled and manual backups each have their own include choices, with the scheduled ones as the default for manual.

**Schedule:**
- Off / Daily / Weekly (pick the day), at a set time (default 3:00 am, after the 2:30 clean-up).
- A missed backup (server off) runs at the next start, like the clean-up.

**Keep:**
- **Keep the latest N backups** (default 7, 1–100). When a new backup finishes and there are more than N, the **oldest is deleted** (never one that's still running, and never before the new one finished successfully).
- **Keep forever** (pin) on any backup: pinned backups don't count towards N and are never replaced. Handy before an upgrade.
- Scheduled and manual backups share the same N.

**Where:** the template's **Backups** folder (`/data/backups`, an Unraid share, ideally on a different disk or pool from the files share). Later: copy each backup off-site (another NAS, Backblaze B2 or S3) with rclone.

## Back up now

One button: **Back up now**, with the include choices (Database / Media) ticked to match the schedule. It runs in the background. The history shows it as Running, then Done or Failed, and the page updates by itself.

## History

One row per backup, newest first:

| Shows | |
|---|---|
| When | started, and how long it took |
| Type | Scheduled or Manual (and who ran it) |
| Includes | Database, Media, or both |
| Size | total, and per part |
| Status | Running, Done, Failed (with the reason) |
| Actions | **Download**, Keep forever / Unpin, Delete |

**Download:**
- **One file per backup** (`grid-backup-2026-11-07-0300.tar`), streamed straight from the server, so even a large media backup downloads without filling the server's memory or disk.
- **Inside:**
  - `database.dump` (pg_dump custom format);
  - `files/` (the media);
  - `manifest.json`: Grid version, database migration, counts, sizes and checksums.

**Footer:** the next scheduled backup time, space used by backups, and free space on the backups share.

## How media is stored

Copying every photo every night would fill the disk fast. Instead, each backup's media folder is a full snapshot, but files that haven't changed since the last backup are **hard links** to the same bytes (the rsync `--link-dest` approach).
- **Every backup looks and restores as complete,** but only new or changed photos use extra space.
- **Deleting an old backup** only frees the photos no other backup still uses.
- **Downloads** pack the snapshot into the `.tar` on the fly.

## Restoring

- **Built:** `grid-restore.sh`, run in the Unraid terminal (steps in `docs/unraid.md`, "Restoring a backup"). It takes a backup folder or a downloaded `.tar`, then:
  1. Checks the checksum, and that this Grid knows every database update in it.
  2. Asks you to type RESTORE.
  3. Stops Grid and saves the current database as `pre-restore-<date>.dump`.
  4. Restores the database into a clean one and copies the photos back (`--exact` also removes photos added since).
  5. Puts `secrets.env` back and starts Grid.
- **Later:** a **Restore** button with a typed confirmation. It first takes a safety backup of the current state.
- **Checks:** the manifest's checksums are verified before anything is overwritten. A backup from a newer Grid version than the server refuses to restore.

## Safety

- **Server admin only:** listing, downloading and deleting backups.
- **Handle downloads with care:** a backup holds everything, including password hashes and encrypted secrets. The download button warns about this.
- **Later:** an optional passphrase to encrypt backups (for off-site copies).
- **Logged:** every backup, download and delete is written to the audit log.
- **Failures:** a failed backup shows a banner on Settings for the server admin (and an email once phase 6 brings email). A backup that fails part-way is deleted, and it never counts towards N.
- **Pre-flight check:** the backup doesn't start if the backups share has less free space than the last backup's size plus 10%; the history says why.

## How it runs

- **A `core.backup` job on the pg-boss runner,** one at a time.
- **Database:** `pg_dump --format=custom`. The app image gains `postgresql-client` at the same major version as the database.
- **New settings** (e.g. a backups-off switch) go in the Unraid template and `.env.example` (`docs/unraid.md`), with the day-to-day choices in the app.
- **secrets.env** from `/config` goes into every backup, so a restore on a new server can still read saved passwords.
- **Media:** a copy with hard links against the previous backup, then a checksum list.
- **Retention** runs after a successful backup.

## Data

- `ServerSetting` key `backups`:
  - `include { database, media }`;
  - `schedule { mode: off | daily | weekly, day, time }`;
  - `keep` (number).
- `BackupRun`:
  - when: `id`, `trigger` (schedule | manual), `triggeredById`, `startedAt`, `finishedAt`;
  - contents: `includes`, `path`;
  - size: `sizeBytes`, `dbBytes`, `mediaBytes`, `newMediaBytes`;
  - outcome: `status` (running | done | failed), `error`;
  - `pinned`, `deletedAt`.

## Build order (about 1–2 days)

1. Settings (include, schedule, keep) and the `core.backup` job: database dump, media snapshot with hard links, manifest.
2. History with streamed Download, pin and delete; retention.
3. Back up now, with live status.
4. Restore guide and `pnpm grid:restore`.
5. Later: Restore button, encryption, off-site copies.
