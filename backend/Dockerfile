# Multi-stage build for the Bill Pay API. The `deps` stage installs the
# full workspace lockfile (Prisma needs to generate its client against
# the schema before the source compiles), `build` runs `prisma generate`
# and `nest build`, `prod-deps` installs the production-only tree (no
# jest / eslint / typescript) and regenerates Prisma against it, and
# `runner` ships only `dist`, `prisma/`, the production node_modules,
# and the entrypoint.
#
# Build from the repo root (pnpm needs the workspace lockfile + manifests):
#   docker build -f backend/Dockerfile -t billpay-api .
#
# Run (expects a reachable Postgres URL):
#   docker run --rm -p 3001:3001 \
#     -e DATABASE_URL=postgresql://postgres:postgres@host.docker.internal:5432/billpay?schema=public \
#     billpay-api
#
# The entrypoint runs `prisma migrate deploy` then `prisma db seed`.
# Both are idempotent — migrate skips applied migrations, seed skips
# itself when the database already contains users (override with
# `BILLPAY_SEED_FORCE=1`).

# ---- deps -----------------------------------------------------------
FROM node:22-alpine AS deps
WORKDIR /workspace

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc* ./
COPY backend/package.json backend/

RUN pnpm install --frozen-lockfile --filter backend...

# ---- build ----------------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /workspace

RUN corepack enable

COPY --from=deps /workspace/node_modules ./node_modules
COPY --from=deps /workspace/backend/node_modules ./backend/node_modules
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc* ./
COPY backend ./backend

WORKDIR /workspace/backend
RUN pnpm exec prisma generate
RUN pnpm run build

# ---- prod-deps ------------------------------------------------------
# Production-only install. `prisma` lives in `dependencies` so the
# `migrate deploy` step at container start has the CLI available without
# pulling in jest, eslint, typescript, etc.
FROM node:22-alpine AS prod-deps
WORKDIR /workspace

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc* ./
COPY backend/package.json backend/

RUN pnpm install --prod --frozen-lockfile --filter backend...

# Prisma client engine binaries are generated against the schema, so
# replay `prisma generate` on the trimmed-down install.
COPY backend/prisma ./backend/prisma
WORKDIR /workspace/backend
RUN pnpm exec prisma generate

# ---- runner ---------------------------------------------------------
# Keep the workspace layout from the prod-deps stage so pnpm's symlinks
# under `backend/node_modules` (which point into the hoisted
# `/workspace/node_modules/.pnpm/` store) keep resolving. Running from
# `/workspace/backend` instead of `/app` keeps the trees intact.
FROM node:22-alpine AS runner
WORKDIR /workspace/backend

ENV NODE_ENV=production
ENV PORT=3001

# Prisma's query engine needs OpenSSL at runtime on Alpine.
RUN apk add --no-cache openssl libc6-compat

COPY --from=prod-deps /workspace/node_modules /workspace/node_modules
COPY --from=prod-deps /workspace/backend/node_modules /workspace/backend/node_modules
COPY --from=build /workspace/backend/dist ./dist
COPY --from=build /workspace/backend/package.json ./package.json
COPY --from=build /workspace/backend/prisma ./prisma

EXPOSE 3001

# `migrate deploy` is idempotent: it applies any pending migrations
# without prompting and is the production-safe equivalent of
# `migrate dev`. `db seed` carries its own no-op guard so a warm volume
# is not wiped. Both CLIs live in `dependencies`, so no `npx` fetch on
# startup.
CMD ["sh", "-c", "./node_modules/.bin/prisma migrate deploy && ./node_modules/.bin/prisma db seed && node dist/main.js"]
