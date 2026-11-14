# Running Grid on Unraid

Grid runs as two containers, each installed from an Unraid template:

| Container | Template | What it is |
|---|---|---|
| `grid-postgres` | `unraid/grid-postgres.xml` | The database (plain Postgres 17) |
| `grid` | `unraid/grid.xml` | The app |

Every setting is a field in the template, so there's no `.env` file to edit. Common ones show by default; the rest are under **Show more settings**. Both templates have a **Time zone (TZ)** field. Unraid also passes its own time zone to every container; the field overrides it.

## Before the first install

1. **Publish the image.** Push the repo to GitHub; the workflow in `.github/workflows/docker.yml` builds `ghcr.io/ausrasplex/grid:latest` on every push to `main` (about 10 minutes the first time). The first build makes the package **private**: on GitHub open your profile › Packages › grid › Package settings › Change visibility › Public, so Unraid can pull it without logging in. The templates already point at `ausrasplex/grid`.
2. **Add the templates.** Copy `unraid/grid-postgres.xml` and `unraid/grid.xml` to the flash drive as `/boot/config/plugins/dockerMan/templates-user/my-grid-postgres.xml` and `my-grid.xml` (e.g. through the `flash` share).
3. **Make the Docker network,** once, in the Unraid terminal: `docker network create grid`. On it, Grid finds the database by name (`grid-postgres`), and the database needs no port open.

## Install

1. **Docker → Add Container → Template: grid-postgres.**
   - Set a long **Password**. Leave User and Database as `grid`.
   - Keep **Database data** on the cache pool (`/mnt/cache/appdata/grid-postgres`).
   - Apply.
2. **Docker → Add Container → Template: grid.**
   - **Database password:** the same password.
   - **Address people use:** e.g. `http://192.168.1.20:3000` (your Unraid IP and the WebUI port), or your domain if you put Grid behind a reverse proxy.
   - **Time zone:** e.g. `Australia/Melbourne`.
   - Check the three folders: Files (photos, plans), Appdata, Backups.
   - Apply.
3. **Open the WebUI** and create the first account. It becomes the server admin. Then "Set up your business".
4. **Optional: Settings › Email.** Pick your provider (Gmail / Google Workspace, Microsoft 365, Zoho, iCloud or other), enter the login, send a test, save. Sign-in links and password resets then work.

## What happens when the container starts

The `grid` container's start-up (`docker/entrypoint.sh`):

1. Builds the database address from **Database host / password / port / user / name**. A **Database URL**, if given, wins.
2. Loads the sign-in secret and encryption key from **appdata/grid/secrets.env**, or makes them on the first start. You can also type your own into the template; typed values win.
3. Creates the Files, Backups and Appdata folders and gives them to **PUID:PGID** (Unraid's `99:100`, nobody:users). It only walks a whole folder when its owner is wrong, so restarts stay quick.
4. Applies database updates for the new version (**Apply database updates on start**, on by default). It waits up to 90 seconds for Postgres.
5. Starts Grid as PUID:PGID. Photos are written as `99:100` with **UMASK** `022`.

**Health check:** the container reports **healthy** once Grid answers at `/api/health` (it checks the database too). Unraid shows this on the Docker tab.

## Updating

- **Images from ghcr.io:** Unraid shows **update ready** once a new image is pushed. Click it, and the container restarts and applies any database updates by itself.
- **Building locally instead** (no GitHub): `docker build -f apps/web/Dockerfile -t grid:latest .` in the repo folder, set the template's Repository to `grid:latest`, and restart the container after each build.

## Backups

Settings › Backups (server admin) covers:
- what to include (database, photos or both);
- daily or weekly, and when;
- how many to keep (pinned ones don't count);
- **Back up now**;
- a history with **Download** for each backup.

Backups go to the template's **Backups** folder. Photos that haven't changed are shared between backups (hard links), so each nightly backup only takes space for new photos. Keep the backups share on a different disk or pool from the files share if you can.

## Restoring a backup

In the Unraid terminal:

```bash
docker cp grid:/app/grid-restore.sh /tmp/
bash /tmp/grid-restore.sh /mnt/user/grid-backups/2026-11-07_0300_ab12cd34
#   or a downloaded file:  bash /tmp/grid-restore.sh /mnt/user/downloads/grid-backup-….tar
```

1. **The checks.** The script checks the backup, then shows what it will do and asks you to type **RESTORE**.
   - It stops if `database.dump` is damaged.
   - It stops if the backup came from a newer Grid. Update the container first in that case.
2. **The restore.** It stops Grid, saves the current database as `pre-restore-<date>.dump` in the backups share, restores the database, copies the photos back and puts `secrets.env` back.
3. **The start.** It starts Grid again; check the Docker tab shows it as **healthy**.

**Options:**
- `--exact` also removes photos added after the backup.
- `--yes` skips the question (for scripts).
- Different container names or shares: `GRID_CONTAINER=… DB_CONTAINER=… FILES_SHARE=… APPDATA=… SAFETY_DIR=… bash grid-restore.sh …`

## Installing Grid as an app (phone, tablet, computer)

Grid can be installed like an app, with its own icon and a full-screen window without the address bar. Browsers only allow this over **https**, so open Grid through your Cloudflare tunnel or reverse proxy address (e.g. `https://grid.example.com`), not `http://192.168.x.x:3000`.

- **Chrome or Edge (computer, Android):** the install icon in the address bar, or ⋮ › Cast, save and share › **Install page as app**.
- **iPhone and iPad (Safari):** Share › **Add to Home Screen**.

If the browser still says it can't be installed, check that **Address people use** in the template is the same https address you opened, and that nothing in front of Grid (such as Cloudflare Access) blocks `/manifest.webmanifest` and `/icon/…`.

## Customer links (signing quotes online)

Quote emails include a private link (`/q/...`) where the customer reads the quote, ticks extras and signs or declines. Signed PDFs have a verify address (`/verify/...`). For these to work from a customer's phone:

- Set **Short link address** (`PUBLIC_LINK_BASE`) to an address the internet can reach, e.g. `https://grid.example.com`, through a reverse proxy (Nginx Proxy Manager, SWAG, a Cloudflare tunnel). Only `/q/`, `/verify`, `/api/public/` and the page assets need to be public if you'd rather not expose sign-in.
- Have the proxy pass the visitor's address in `X-Forwarded-For`. The signing certificate records it.
- Email must be set up (Settings › Email): the customer confirms with a code emailed to them.

The certificate that seals signed PDFs is made on first use and kept in the database, encrypted with the key in `secrets.env`, so it's in every backup.

## Back these up

- **appdata/grid:** `secrets.env`. Without it, saved passwords (email, connections) and the PDF sealing certificate can't be read, and everyone has to sign in again.
- **appdata/grid-postgres:** the database. Grid's own backups (Settings › Backups) cover it while it's running; the Appdata Backup plugin also works, with the database stopped.
- **The files share:** photos, plans and documents. Its `.cache` folder (plan tiles) is skipped by backups: Grid makes it again from the originals.

## Settings reference

| Template field | Variable | Default | Notes |
|---|---|---|---|
| WebUI port | port 3000 | 3000 | |
| Files (photos) | `/data/files` | `/mnt/user/grid-files` | |
| Appdata | `/config` | `/mnt/user/appdata/grid` | holds `secrets.env` |
| Backups | `/data/backups` | `/mnt/user/grid-backups` | Settings › Backups |
| Database host | `DB_HOST` | `grid-postgres` | |
| Database password | `DB_PASSWORD` | | required |
| Address people use | `BETTER_AUTH_URL` | | required |
| Time zone | `TZ` | `Australia/Melbourne` | |
| Sign-up | `SIGNUP_MODE` | `invite` | `open` lets anyone sign up |
| Other addresses | `TRUSTED_ORIGINS` | | more |
| PUID / PGID / UMASK | | `99` / `100` / `022` | more |
| Database port / user / name | `DB_PORT` `DB_USER` `DB_NAME` | `5432` / `grid` / `grid` | more |
| Database URL | `DATABASE_URL` | | more; overrides the parts |
| Apply database updates on start | `MIGRATE_ON_START` | `true` | more |
| Sign-in secret | `BETTER_AUTH_SECRET` | made for you | more |
| Encryption key | `APP_ENCRYPTION_KEY` | made for you | more; never change once set |
| Short link address | `PUBLIC_LINK_BASE` | | more |
| Server code prefix | `INSTANCE_ID` | | more; later |
| Scheduled jobs | `JOBS` | `on` | more |

**Not in the template:** settings an admin changes day to day live in the app, stored in the database, so they survive updates and need no restart. These are the **email server** (Settings › Email), the clean-up days, on/off and time (Settings › Storage), the backup schedule, contents and how many to keep (Settings › Backups), plus everything per business.

## Adding a setting (for development)

Decide first which kind it is:

- **Needed before the app can start, or part of the server set-up** (database, addresses, secrets, folders): an environment variable. Add it to `unraid/grid.xml` and `.env.example` in the same change; `pnpm test` fails until you do (`scripts/env.test.mjs`).
- **Changed day to day by an admin:** an in-app setting only (`ServerSetting` for the server, the company's settings for a business), with its starting value in the code. Never both.
