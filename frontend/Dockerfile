# Multi-stage build for the Bill Pay frontend. Mirrors the backend's
# shape (deps → build → prod-deps → runner) so reviewers see the same
# pattern on both sides.
#
# Build from the repo root (pnpm needs the workspace lockfile + manifests):
#   docker build -f frontend/Dockerfile -t billpay-web .
#
# Run (point the public env at the backend the browser can reach):
#   docker run --rm -p 3000:3000 \
#     -e NEXT_PUBLIC_API_BASE_URL=http://localhost:3001/api/v1 \
#     billpay-web

# ---- deps -----------------------------------------------------------
FROM node:22-alpine AS deps
WORKDIR /workspace

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc* ./
COPY frontend/package.json frontend/

RUN pnpm install --frozen-lockfile --filter frontend...

# ---- build ----------------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /workspace

RUN corepack enable

COPY --from=deps /workspace/node_modules ./node_modules
COPY --from=deps /workspace/frontend/node_modules ./frontend/node_modules
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc* ./
COPY frontend ./frontend

# `NEXT_PUBLIC_*` is inlined at build time. Override with `--build-arg`
# when baking an image for a non-default backend URL.
ARG NEXT_PUBLIC_API_BASE_URL=http://localhost:3001/api/v1
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL

WORKDIR /workspace/frontend
RUN pnpm run build

# ---- runner ---------------------------------------------------------
# Next.js standalone output ships its own minimal node_modules, so the
# runner stage doesn't need a separate prod-deps stage — copy `.next/standalone`,
# `.next/static`, and `public/` and call `node server.js`.
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN apk add --no-cache libc6-compat

# `next.config.ts` sets `output: 'standalone'`. The standalone folder
# already contains the trimmed node_modules and the entry script.
COPY --from=build /workspace/frontend/.next/standalone ./
COPY --from=build /workspace/frontend/.next/static ./frontend/.next/static
COPY --from=build /workspace/frontend/public ./frontend/public

EXPOSE 3000

# The standalone build emits its entrypoint inside the `frontend/` dir
# because that's the workspace root we built from.
CMD ["node", "frontend/server.js"]
