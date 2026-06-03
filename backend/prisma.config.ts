import { defineConfig } from 'prisma/config';

// Replaces the `prisma` block in `package.json`, which is deprecated in
// Prisma 6.x and removed in 7.x. Only the seed command lives here for
// now — the datasource stays declared inside `schema.prisma`.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    // tsx is a runtime dependency (single esbuild-backed binary) so the
    // production Docker image can run the seed without pulling
    // `ts-node` + the full TypeScript compiler into the runtime tree.
    // Resolve the bin via `node_modules/.bin` so Prisma's seed spawn
    // does not depend on PATH — the runner image's WORKDIR is the
    // backend package, so the relative path is stable.
    seed: './node_modules/.bin/tsx prisma/seed.ts',
  },
});
