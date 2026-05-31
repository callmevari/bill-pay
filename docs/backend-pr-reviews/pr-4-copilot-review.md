Re: [callmevari/bill-pay] chore(test): add e2e suite with isolated database (PR #4)

@Copilot commented on this pull request.

Pull request overview
Adds a backend e2e testing layer that boots the real Nest app against an isolated Postgres schema, plus documentation for the project’s unit/e2e testing contract.

Changes:

Adds e2e setup helpers, DB reset/seed utilities, and new bills/vendors e2e specs.
Configures Jest e2e setup and backend test scripts/dependencies.
Documents the testing strategy in README, docs/backend.md, and CLAUDE.md.
Reviewed changes
Copilot reviewed 13 out of 14 changed files in this pull request and generated 3 comments.

Show a summary per file
File	Description
backend/.env.test	Defines the isolated e2e database schema URL.
backend/package.json	Adds test:all and dotenv dev dependency.
backend/test/jest-e2e.json	Wires global setup and per-worker env setup for e2e tests.
backend/test/global-setup.ts	Loads test env and applies Prisma migrations before e2e tests.
backend/test/setup-env.ts	Loads test env before each e2e worker imports app code.
backend/test/helpers/app.ts	Adds shared Nest app bootstrap helper for e2e specs.
backend/test/helpers/db.ts	Adds database reset and minimal seed helpers.
backend/test/app.e2e-spec.ts	Refactors health e2e spec to use the shared app helper.
backend/test/bills.e2e-spec.ts	Adds bills e2e coverage for persistence, listing, validation, and guards.
backend/test/vendors.e2e-spec.ts	Adds vendors e2e coverage for persistence, delete guard, and role guard.
pnpm-lock.yaml	Locks the new dotenv dependency.
README.md	Adds testing overview and e2e prerequisites.
docs/backend.md	Adds detailed backend testing strategy.
CLAUDE.md	Adds project testing contract and quality-bar updates.
Files not reviewed (1)
pnpm-lock.yaml: Language not supported
💡 Add Copilot custom instructions for smarter, more guided reviews. Learn how to get started.

In backend/test/global-setup.ts:

> @@ -0,0 +1,18 @@
+import { execSync } from 'node:child_process';
+import { resolve } from 'node:path';
+
+import { config } from 'dotenv';
+
+// Runs once before any e2e test starts. Loads `.env.test` and applies
+// `prisma migrate deploy` against the isolated `test_e2e` schema so the
+// schema exists and is in sync with the current migrations. Idempotent —
+// re-running between test invocations is a no-op once tables exist.
+export default function globalSetup(): void {
+  config({ path: resolve(__dirname, '..', '.env.test'), quiet: true });
The setup relies on .env.test for isolation, but dotenv does not replace an already-present DATABASE_URL by default. If a shell/CI environment has DATABASE_URL set, this migrate deploy can run against that schema instead of test_e2e, which breaks the documented isolation contract.

In backend/test/setup-env.ts:

> @@ -0,0 +1,7 @@
+import { config } from 'dotenv';
+import { resolve } from 'node:path';
+
+// Runs in every Jest e2e worker before the test file is imported. Loads
+// `.env.test` so PrismaClient (constructed at import time inside Nest
+// providers) picks up the isolated `test_e2e` schema URL.
+config({ path: resolve(__dirname, '..', '.env.test'), quiet: true });
This per-worker load has the same isolation hole as global setup: without override: true, any pre-existing DATABASE_URL wins over .env.test, so the Nest app's PrismaClient can connect to the wrong schema even though the helper reset code assumes test_e2e.

In backend/test/jest-e2e.json:

> +  "globalSetup": "<rootDir>/global-setup.ts",
+  "setupFiles": ["<rootDir>/setup-env.ts"]
The new specs all reset and seed the same test_e2e schema in beforeEach, but Jest can run e2e spec files in parallel by default. Concurrent files can delete or reseed each other's rows mid-test, making this suite flaky and potentially invalidating assertions; serialize the e2e project when using a shared schema.