import { defineConfig } from 'prisma/config';

// Replaces the `prisma` block in `package.json`, which is deprecated in
// Prisma 6.x and removed in 7.x. Only the seed command lives here for
// now — the datasource stays declared inside `schema.prisma`.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    seed: 'ts-node --transpile-only prisma/seed.ts',
  },
});
