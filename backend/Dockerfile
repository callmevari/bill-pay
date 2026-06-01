# Multi-stage build for the Bill Pay API. The deps stage installs the
# full workspace lockfile (Prisma needs to generate its client against
# the schema before the source compiles), the build stage runs
# `prisma generate` and `nest build`, and the runner stage ships only
# `dist`, `prisma/`, the production node_modules, and the entrypoint.
#
# Build from the repo root (pnpm needs the workspace lockfile + manifests):
#   docker build -f backend/Dockerfile -t billpay-api .
#
# Run (expects a reachable Postgres URL):
#   docker run --rm -p 3001:3001 \
#     -e DATABASE_URL=postgresql://postgres:postgres@host.docker.internal:5432/billpay?schema=public \
#     billpay-api

# ---- deps -----------------------------------------------------------
FROM node:20-alpine AS deps
WORKDIR /workspace

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc* ./
COPY backend/package.json backend/

RUN pnpm install --frozen-lockfile --filter backend...

# ---- build ----------------------------------------------------------
FROM node:20-alpine AS build
WORKDIR /workspace

RUN corepack enable

COPY --from=deps /workspace/node_modules ./node_modules
COPY --from=deps /workspace/backend/node_modules ./backend/node_modules
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc* ./
COPY backend ./backend

WORKDIR /workspace/backend
RUN pnpm exec prisma generate
RUN pnpm run build

# ---- runner ---------------------------------------------------------
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001

# Prisma's query engine needs OpenSSL at runtime on Alpine.
RUN apk add --no-cache openssl libc6-compat

COPY --from=build /workspace/backend/dist ./dist
COPY --from=build /workspace/backend/node_modules ./node_modules
COPY --from=build /workspace/backend/package.json ./package.json
COPY --from=build /workspace/backend/prisma ./prisma

EXPOSE 3001

# `migrate deploy` is idempotent: it applies any pending migrations
# without prompting and is the production-safe equivalent of
# `migrate dev`. Seed runs once on a fresh DB (the seed is also
# idempotent on existing rows via upserts).
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
