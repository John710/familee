# syntax=docker/dockerfile:1
#
# Familee - building the application into a single container
#
# Postgres, Redis and traefik already run on the server, so only the
# application itself is built here. The result is an Alpine-based image
# with a standalone Next.js build: nothing inside but the server bundle
# and the native modules it needs, without dev dependencies.
#
# Build:  docker compose build
# Start:  docker compose up -d

ARG NODE_IMAGE=node:26-alpine

# ─── Shared base ────────────────────────────────────────────────────
FROM ${NODE_IMAGE} AS base

# libc6-compat is required by native modules (sharp) on musl systems.
RUN apk add --no-cache libc6-compat

ENV NEXT_TELEMETRY_DISABLED=1

# ─── Dependencies ───────────────────────────────────────────────────
FROM base AS deps
WORKDIR /app

# The manifests only: the dependency layer is rebuilt when package.json
# or the lock file changes, not on every edit of the code.
COPY package.json package-lock.json* ./

# npm ci needs a lock file. On the very first build there is none yet, so
# a plain install is used instead. After the first build it is worth
# taking package-lock.json out of the container and committing it:
#   docker compose run --rm --no-deps app cat /app/package-lock.json
RUN if [ -f package-lock.json ]; then \
        npm ci; \
    else \
        npm install --no-audit --no-fund; \
    fi

# ─── Build ──────────────────────────────────────────────────────────
FROM base AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# The build never connects to the database, but the src/db module checks
# that the variable is present on import - hence a deliberately fake value
# so that `next build` does not fail. At run time the real one comes from .env.
ENV DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build
ENV REDIS_URL=redis://127.0.0.1:6379/0
ENV BETTER_AUTH_SECRET=build-time-placeholder-not-used-at-runtime
ENV BETTER_AUTH_URL=https://build.invalid
ENV NODE_ENV=production

RUN npm run build

# ─── Final image ────────────────────────────────────────────────────
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    MEDIA_ROOT=/data/media

# tini forwards signals properly: `docker compose stop` shuts Node.js down
# in an orderly way instead of hitting the timeout.
RUN apk add --no-cache tini

# The photographs directory is the mount point of the familee_media volume.
# Its owner is the built-in node user (uid 1000) that comes with the image.
RUN mkdir -p /data/media && chown -R node:node /data/media

COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static

USER node
EXPOSE 3000

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]
