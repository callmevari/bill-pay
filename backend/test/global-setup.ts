import { execSync } from 'node:child_process';
import { resolve } from 'node:path';

import { config } from 'dotenv';

// Runs once before any e2e test starts. Loads `.env.test` and applies
// `prisma migrate deploy` against the isolated `test_e2e` schema so the
// schema exists and is in sync with the current migrations. Idempotent —
// re-running between test invocations is a no-op once tables exist.
export default function globalSetup(): void {
  config({ path: resolve(__dirname, '..', '.env.test'), quiet: true });

  execSync('npx prisma migrate deploy', {
    cwd: resolve(__dirname, '..'),
    stdio: 'inherit',
    env: process.env,
  });
}
