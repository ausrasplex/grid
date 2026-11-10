# Grid app image. Built from the repo root:
#   docker build -f apps/web/Dockerfile -t grid .
# On Unraid it's installed with the template in unraid/grid.xml (see docs/unraid.md).
FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /repo

FROM base AS build
# Prisma needs a database address even just to generate code; this one is never used.
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm db:generate
RUN pnpm --filter @grid/web build
# Prisma CLI on its own, so the running container can apply migrations at start.
RUN mkdir -p /migrate \
 && cd /migrate \
 && PRISMA_VERSION="$(node -p 'require("/repo/node_modules/prisma/package.json").version')" \
 && DOTENV_VERSION="$(node -p 'require("/repo/node_modules/dotenv/package.json").version')" \
 && npm init -y >/dev/null \
 && npm install --omit=dev --no-audit --no-fund "prisma@${PRISMA_VERSION}" "dotenv@${DOTENV_VERSION}" \
 && cp -r /repo/prisma /migrate/prisma \
 && cp /repo/prisma.config.ts /migrate/prisma.config.ts

FROM node:22-alpine AS run
# su-exec: run as Unraid's PUID/PGID. tzdata: the TZ variable.
# postgresql17-client: pg_dump for backups (same major version as grid-postgres).
# chromium + fonts: turning quotes and reports into PDFs.
# poppler-utils: reading and rendering plan PDFs (pdfinfo, pdftotext, pdftoppm).
RUN apk add --no-cache su-exec tzdata postgresql17-client \
      chromium nss freetype harfbuzz ttf-liberation font-noto font-dejavu poppler-utils
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 \
    FILES_ROOT=/data/files BACKUPS_ROOT=/data/backups CONFIG_DIR=/config \
    PUID=99 PGID=100 UMASK=022 \
    CHROMIUM_PATH=/usr/bin/chromium-browser
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /migrate /app/migrate
# Scripts are made executable and given Unix line endings here, so a copy
# that lost its execute bit or gained Windows line endings (uploaded through
# the GitHub website, checked out on Windows) still starts.
COPY docker/entrypoint.sh /usr/local/bin/grid-entrypoint
# The restore script runs on the Unraid host; copy it out with:
#   docker cp grid:/app/grid-restore.sh /tmp/
COPY scripts/grid-restore.sh /app/grid-restore.sh
RUN sed -i 's/\r$//' /usr/local/bin/grid-entrypoint /app/grid-restore.sh \
 && chmod 0755 /usr/local/bin/grid-entrypoint /app/grid-restore.sh
VOLUME ["/config", "/data/files", "/data/backups"]
EXPOSE 3000
# Node's fetch, not wget: it ignores proxy variables a server might set.
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
# Starts as root only to set folder owners, then runs Grid as PUID:PGID.
ENTRYPOINT ["/usr/local/bin/grid-entrypoint"]
