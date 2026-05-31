import { execSync } from 'node:child_process';
import { resolve } from 'node:path';

import { config } from 'dotenv';

// Runs once before any e2e test starts. Loads `.env.test` and applies
// `prisma migrate deploy` against the isolated `test_e2e` schema so the
// schema exists and is in sync with the current migrations. Idempotent —
// re-running between test invocations is a no-op once tables exist.
export default function globalSetup(): void {
  // `override: true` is intentional: a pre-existing DATABASE_URL in the
  // shell or CI environment would otherwise win over `.env.test`, and
  // `prisma migrate deploy` would run against the wrong schema — silently
  // breaking the isolation contract the whole suite assumes.
  config({
    path: resolve(__dirname, '..', '.env.test'),
    quiet: true,
    override: true,
  });

  execSync('npx prisma migrate deploy', {
    cwd: resolve(__dirname, '..'),
    stdio: 'inherit',
    env: process.env,
  });
}
