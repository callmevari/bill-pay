import { config } from 'dotenv';
import { resolve } from 'node:path';

// Runs in every Jest e2e worker before the test file is imported. Loads
// `.env.test` so PrismaClient (constructed at import time inside Nest
// providers) picks up the isolated `test_e2e` schema URL.
// `override: true` is intentional — see test/global-setup.ts for the
// full reasoning. Without it, a pre-existing DATABASE_URL in the shell
// or CI environment would silently win and the worker's PrismaClient
// would connect to the wrong schema.
config({
  path: resolve(__dirname, '..', '.env.test'),
  quiet: true,
  override: true,
});
