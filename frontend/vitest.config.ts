import path from 'node:path';
import { defineConfig } from 'vitest/config';

// Lean Vitest setup — the FE is mostly thin React glue around TanStack
// Query / Table and Radix primitives. The bits worth unit-testing are
// the pure helpers in `src/lib` (API client, money / date wire
// transforms, role permissions). Component behaviour is exercised by
// the backend e2e suite + manual UI passes; React-Testing-Library is
// intentionally NOT pulled in for the MVP.
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.{spec,test}.ts'],
  },
});
