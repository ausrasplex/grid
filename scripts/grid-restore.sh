#!/bin/bash
# Restore a Grid backup on Unraid. Run it in the Unraid terminal:
#
#   bash grid-restore.sh /mnt/user/grid-backups/2026-11-07_0300_ab12cd34
#   bash grid-restore.sh ~/grid-backup-2026-11-07_0300_ab12cd34.tar
#
# What it does (docs/unraid.md, "Restoring a backup"):
#   1. Checks the backup: manifest, database checksum, and that this Grid
#      version knows every database update in it.
#   2. Asks you to type RESTORE.
#   3. Stops Grid, saves a copy of the current database next to the backups,
#      restores the database, copies the photos back and puts the keys back.
#   4. Starts Grid again.
#
# Defaults match the Unraid templates; change them with variables, e.g.
#   FILES_SHARE=/mnt/user/my-files bash grid-restore.sh …
set -euo pipefail

GRID_CONTAINER="${GRID_CONTAINER:-grid}"
DB_CONTAINER="${DB_CONTAINER:-grid-postgres}"
FILES_SHARE="${FILES_SHARE:-/mnt/user/grid-files}"
APPDATA="${APPDATA:-/mnt/user/appdata/grid}"
SAFETY_DIR="${SAFETY_DIR:-/mnt/user/grid-backups}"
# --exact: also remove photos added after the backup was made (an exact copy).
EXACT=false
YES=false

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
die() { printf '\n\033[31mStopped: %s\033[0m\n' "$*" >&2; exit 1; }

SRC=""
for a in "$@"; do
  case "$a" in
    --exact) EXACT=true ;;
    --yes) YES=true ;;
    -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
    *) SRC="$a" ;;
  esac
done
[ -n "$SRC" ] || die "Give the backup folder or .tar file. See: bash $0 --help"

# --- Unpack a downloaded .tar ---------------------------------------------
CLEANUP=""
if [ -f "$SRC" ]; then
  TMP="$(mktemp -d "${SAFETY_DIR%/}/.restore-XXXXXX")"
  CLEANUP="$TMP"
  trap '[ -n "$CLEANUP" ] && rm -rf "$CLEANUP"' EXIT
  say "Unpacking $SRC…"
  tar -xf "$SRC" -C "$TMP"
  SRC="$(find "$TMP" -mindepth 1 -maxdepth 1 -type d | head -1)"
fi
[ -f "$SRC/manifest.json" ] || die "$SRC doesn't look like a Grid backup (no manifest.json)"

# --- 1. Check it ----------------------------------------------------------
say "Checking the backup…"
HAS_DB=false; HAS_FILES=false
[ -f "$SRC/database.dump" ] && HAS_DB=true
[ -d "$SRC/files" ] && HAS_FILES=true
$HAS_DB || $HAS_FILES || die "The backup has neither a database nor photos"

if $HAS_DB; then
  WANT="$(grep -A3 '"database"' "$SRC/manifest.json" | sed -n 's/.*"sha256": *"\([0-9a-f]*\)".*/\1/p' | head -1)"
  HAVE="$(sha256sum "$SRC/database.dump" | cut -d' ' -f1)"
  [ "$WANT" = "$HAVE" ] || die "database.dump doesn't match its checksum: the backup is damaged"
  echo "  Database checksum OK"

  # Every database update in the backup must be one this Grid version has.
  KNOWN="$(docker exec "$GRID_CONTAINER" ls /app/migrate/prisma/migrations 2>/dev/null)" ||
    die "Couldn't look inside the $GRID_CONTAINER container. Is it running? (Start it, then run this again.)"
  MIGRATIONS="$(sed -n '/"migrations"/,/\]/p' "$SRC/manifest.json" | sed -n 's/^ *"\([0-9]\{14\}_[^"]*\)".*/\1/p')"
  for m in $MIGRATIONS; do
    echo "$KNOWN" | grep -qx "$m" || die "The backup was made by a newer Grid (it has database update $m). Update the grid container first."
  done
  echo "  Made by this Grid version or an older one: OK"
fi

echo
echo "  Backup:   $SRC"
$HAS_DB && echo "  Database: will REPLACE everything in the database"
$HAS_FILES && { $EXACT && echo "  Photos:   will make $FILES_SHARE an exact copy (newer photos removed)" || echo "  Photos:   will copy back into $FILES_SHARE (photos added since are kept)"; }
[ -f "$SRC/secrets.env" ] && echo "  Keys:     will put secrets.env back in $APPDATA"

if ! $YES; then
  printf '\nType RESTORE to go ahead: '
  read -r answer
  [ "$answer" = "RESTORE" ] || die "Nothing was changed"
fi

# --- 3. Restore -----------------------------------------------------------
say "Stopping $GRID_CONTAINER…"
docker stop "$GRID_CONTAINER" >/dev/null

if $HAS_DB; then
  STAMP="$(date +%Y-%m-%d_%H%M)"
  SAFETY="${SAFETY_DIR%/}/pre-restore-$STAMP.dump"
  say "Saving the current database to $SAFETY (in case you need it back)…"
  docker exec "$DB_CONTAINER" sh -c 'pg_dump --format=custom -U "$POSTGRES_USER" "$POSTGRES_DB"' > "$SAFETY"

  say "Restoring the database…"
  # Start from an empty database so nothing from after the backup is left behind.
  docker exec "$DB_CONTAINER" sh -c 'psql -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres -c "DROP DATABASE IF EXISTS \"$POSTGRES_DB\" WITH (FORCE);" -c "CREATE DATABASE \"$POSTGRES_DB\" OWNER \"$POSTGRES_USER\";"'
  docker exec -i "$DB_CONTAINER" sh -c 'pg_restore --no-owner --no-privileges --exit-on-error -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < "$SRC/database.dump"
  echo "  Database restored"
fi

if $HAS_FILES; then
  say "Copying photos back…"
  mkdir -p "$FILES_SHARE"
  if command -v rsync >/dev/null; then
    if $EXACT; then rsync -a --delete "$SRC/files/" "$FILES_SHARE/"; else rsync -a "$SRC/files/" "$FILES_SHARE/"; fi
  else
    $EXACT && find "$FILES_SHARE" -mindepth 1 -delete
    cp -a "$SRC/files/." "$FILES_SHARE/"
  fi
  echo "  Photos copied"
fi

if [ -f "$SRC/secrets.env" ]; then
  mkdir -p "$APPDATA"
  [ -f "$APPDATA/secrets.env" ] && cp "$APPDATA/secrets.env" "$APPDATA/secrets.env.before-restore"
  cp "$SRC/secrets.env" "$APPDATA/secrets.env"
  chmod 600 "$APPDATA/secrets.env"
  echo "  Keys put back (if the grid template sets BETTER_AUTH_SECRET or APP_ENCRYPTION_KEY, make them match secrets.env)"
fi

# --- 4. Start --------------------------------------------------------------
say "Starting $GRID_CONTAINER…"
docker start "$GRID_CONTAINER" >/dev/null
echo "  Grid applies any newer database updates as it starts. Check the Docker tab shows it as healthy."
say "Restore finished."
