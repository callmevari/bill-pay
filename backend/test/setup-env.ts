import { config } from 'dotenv';
import { resolve } from 'node:path';

// Runs in every Jest e2e worker before the test file is imported. Loads
// `.env.test` so PrismaClient (constructed at import time inside Nest
// providers) picks up the isolated `test_e2e` schema URL.
config({ path: resolve(__dirname, '..', '.env.test'), quiet: true });
