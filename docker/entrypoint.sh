#!/bin/sh
# Grid container start-up (Unraid template or docker compose).
#
#  1. Works out the database address (DATABASE_URL, or DB_HOST + DB_PASSWORD…).
#  2. Loads or creates the sign-in and encryption secrets in /config, if they
#     weren't given as variables, so a fresh install needs no openssl.
#  3. Makes the data folders and gives them to PUID:PGID (Unraid: 99:100).
#  4. Applies database migrations (MIGRATE_ON_START=false to skip).
#  5. Starts Grid as PUID:PGID.
set -eu

PUID="${PUID:-99}"
PGID="${PGID:-100}"
UMASK="${UMASK:-022}"
CONFIG_DIR="${CONFIG_DIR:-/config}"
export FILES_ROOT="${FILES_ROOT:-/data/files}"
export BACKUPS_ROOT="${BACKUPS_ROOT:-/data/backups}"
umask "$UMASK"

log() { echo "[grid] $*"; }
enc() { node -e 'process.stdout.write(encodeURIComponent(process.argv[1]))' "$1"; }

# --- 1. Database --------------------------------------------------------
if [ -z "${DATABASE_URL:-}" ]; then
  if [ -z "${DB_HOST:-}" ] || [ -z "${DB_PASSWORD:-}" ]; then
    log "Set DB_HOST and DB_PASSWORD (or DATABASE_URL) so Grid can reach Postgres."
    exit 1
  fi
  DATABASE_URL="postgresql://$(enc "${DB_USER:-grid}"):$(enc "$DB_PASSWORD")@${DB_HOST}:${DB_PORT:-5432}/$(enc "${DB_NAME:-grid}")"
fi
export DATABASE_URL

# --- 2. Secrets ---------------------------------------------------------
mkdir -p "$CONFIG_DIR"
SECRETS="$CONFIG_DIR/secrets.env"
if [ -f "$SECRETS" ]; then
  # shellcheck disable=SC1090
  . "$SECRETS"
fi
gen() { node -e 'process.stdout.write(require("crypto").randomBytes(32).toString("base64"))'; }
if [ -z "${BETTER_AUTH_SECRET:-}" ] || [ -z "${APP_ENCRYPTION_KEY:-}" ]; then
  [ -n "${BETTER_AUTH_SECRET:-}" ] || BETTER_AUTH_SECRET="$(gen)"
  [ -n "${APP_ENCRYPTION_KEY:-}" ] || APP_ENCRYPTION_KEY="$(gen)"
  if [ ! -f "$SECRETS" ]; then
    printf 'BETTER_AUTH_SECRET=%s\nAPP_ENCRYPTION_KEY=%s\n' "$BETTER_AUTH_SECRET" "$APP_ENCRYPTION_KEY" > "$SECRETS"
    chmod 600 "$SECRETS"
    log "Created $SECRETS. Back it up with your appdata: without it, saved passwords for email etc. can't be read."
  fi
fi
export BETTER_AUTH_SECRET APP_ENCRYPTION_KEY

if [ -z "${BETTER_AUTH_URL:-}" ]; then
  log "BETTER_AUTH_URL isn't set. Set it to the address you open Grid at, e.g. http://192.168.1.20:3000"
fi

# --- 3. Folders and ownership -------------------------------------------
own() {
  mkdir -p "$1"
  # Only walk the whole folder when its owner is wrong (first run, or PUID changed).
  if [ "$(stat -c %u:%g "$1")" != "$PUID:$PGID" ]; then
    log "Setting owner of $1 to $PUID:$PGID"
    chown -R "$PUID:$PGID" "$1"
  fi
}
if [ "$(id -u)" = "0" ]; then
  own "$FILES_ROOT"
  own "$BACKUPS_ROOT"
  own "$CONFIG_DIR"
  chown -R "$PUID:$PGID" /app/apps/web/.next 2>/dev/null || true
  RUN="su-exec $PUID:$PGID"
else
  mkdir -p "$FILES_ROOT" "$BACKUPS_ROOT"
  RUN=""
fi

# --- 4. Migrations -------------------------------------------------------
if [ "${MIGRATE_ON_START:-true}" != "false" ]; then
  log "Applying database migrations…"
  tries=0
  until $RUN node /app/migrate/node_modules/prisma/build/index.js migrate deploy --config /app/migrate/prisma.config.ts; do
    tries=$((tries + 1))
    if [ "$tries" -ge 30 ]; then
      log "Couldn't reach the database after 30 tries. Check DB_HOST, DB_PASSWORD and that Postgres is running."
      exit 1
    fi
    log "Database not ready yet, trying again in 3 seconds ($tries/30)"
    sleep 3
  done
fi

# --- 5. Start ------------------------------------------------------------
log "Starting Grid on port ${PORT:-3000}"
cd /app
# shellcheck disable=SC2086
exec $RUN node apps/web/server.js
