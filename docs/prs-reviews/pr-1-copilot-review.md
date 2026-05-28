Re: [callmevari/bill-pay] feat(backend): bootstrap data model, API skeleton, auth, seed, bruno (PR #1)

@Copilot commented on this pull request.

Pull request overview
Bootstraps the Bill Pay project through early backend phases: establishes the product/implementation documentation, introduces the initial Prisma data model + migration + seed data, and scaffolds a NestJS API skeleton with basic auth/role guards, error envelope handling, health endpoint, Swagger, and a Bruno collection for end-to-end review.

Changes:

Added foundational docs (scope, implementation plan, backend decisions) and repo constitution/playbooks.
Added backend bootstrap: NestJS app skeleton (health + Swagger), global auth guards, Prisma module, and global exception filter.
Added initial data layer: Prisma schema + initial migration + realistic seed data, plus docker-compose Postgres and Bruno collection/environments.
Reviewed changes
Copilot reviewed 47 out of 53 changed files in this pull request and generated 9 comments.

Show a summary per file
File	Description
README.md	Updates repo structure description to include backend decisions log.
pnpm-workspace.yaml	Adds workspace build/script allow-list configuration.
docs/product-scope.md	Defines MVP scope, roles, and in/out-of-scope decisions.
docs/implementation-plan.md	Defines phased delivery plan and exit criteria.
docs/backend.md	Records backend technical decisions and lifecycle/state machine notes.
docs/api-contract.md	Adds API contract doc placeholder (currently empty).
docker-compose.yml	Adds local Postgres service with healthcheck.
CLAUDE.md	Adds cross-cutting repo constitution (stack, conventions, auth model, forbidden patterns).
backend/tsconfig.json	Adds backend TypeScript compiler configuration.
backend/tsconfig.build.json	Adds build-specific tsconfig exclusions.
backend/test/jest-e2e.json	Adds Jest e2e config for backend.
backend/test/app.e2e-spec.ts	Adds e2e test scaffold (currently targets /).
backend/src/prisma/prisma.service.ts	Adds PrismaService lifecycle (connect/disconnect).
backend/src/prisma/prisma.module.ts	Adds global Prisma module export.
backend/src/main.ts	Adds Nest bootstrap: global prefix, CORS, ValidationPipe, Swagger.
backend/src/health/health.module.ts	Adds HealthModule.
backend/src/health/health.controller.ts	Adds public health endpoint.
backend/src/common/filters/global-exception.filter.ts	Adds global exception filter producing a JSON error envelope.
backend/src/common/errors/error-codes.ts	Adds stable error code constants.
backend/src/auth/roles.guard.ts	Adds roles guard using @Roles(...) metadata.
backend/src/auth/roles.decorator.ts	Adds @Roles(...) decorator and metadata key.
backend/src/auth/public.decorator.ts	Adds @Public() decorator and metadata key.
backend/src/auth/current-user.guard.ts	Adds current-user guard reading x-user-id and attaching request.user.
backend/src/auth/current-user.decorator.ts	Adds @CurrentUser() param decorator.
backend/src/auth/auth.module.ts	Registers global guards (current user + roles).
backend/src/auth/auth-user.ts	Defines AuthUser type and extends Express Request typing.
backend/src/app.module.ts	Wires Prisma/Auth/Health modules + global exception filter.
backend/prisma/seed.ts	Adds seed script: users, vendors, bills, payments, activity log.
backend/prisma/seed-ids.ts	Adds deterministic seed user IDs for Bruno/environments.
backend/prisma/schema.prisma	Adds initial Prisma schema (models + enums + indexes).
backend/prisma/migrations/migration_lock.toml	Adds Prisma migration lock.
backend/prisma/migrations/20260526083446_init/migration.sql	Adds initial SQL migration for all tables/enums/indexes.
backend/package.json	Adds backend package scripts and dependencies/devDependencies.
backend/nest-cli.json	Adds Nest CLI config.
backend/eslint.config.mjs	Adds backend ESLint + Prettier configuration.
backend/bruno/health/get-health.bru	Adds Bruno request for health endpoint.
backend/bruno/environments/prod-viewer.bru	Adds prod viewer Bruno environment.
backend/bruno/environments/prod-approver.bru	Adds prod approver Bruno environment.
backend/bruno/environments/prod-admin.bru	Adds prod admin Bruno environment.
backend/bruno/environments/local-viewer.bru	Adds local viewer Bruno environment.
backend/bruno/environments/local-approver.bru	Adds local approver Bruno environment.
backend/bruno/environments/local-admin.bru	Adds local admin Bruno environment.
backend/bruno/collection.bru	Adds collection-level x-user-id header and collection docs.
backend/bruno/bruno.json	Adds Bruno collection metadata.
backend/.prettierrc	Adds backend Prettier config.
backend/.env.example	Adds backend env example (DATABASE_URL, PORT).
.vscode/settings.json	Pins Prisma extension behavior to Prisma 6.
.gitignore	Allows committing .vscode/settings.json while ignoring other .vscode files.
.claude/agents/backend-engineer.md	Adds backend agent playbook (scope, conventions, phase guidance).
💡 Add Copilot custom instructions for smarter, more guided reviews. Learn how to get started.

In backend/test/app.e2e-spec.ts:

> +  it('/ (GET)', () => {
+    return request(app.getHttpServer())
+      .get('/')
+      .expect(200)
+      .expect('Hello World!');
+  });
The e2e test asserts GET / returns "Hello World!", but this app currently only exposes /api/v1/health (and there is no AppController). This test will fail or validate a route that isn't part of the intended API surface; update it to hit the health endpoint and (ideally) configure the same global prefix used in main.ts.

In backend/prisma/schema.prisma:

> +model Vendor {
+  id                   String         @id @default(cuid(2))
+  name                 String
+  email                String?
+  defaultPaymentMethod PaymentMethod?
+  streetAddress        String?
+  city                 String?
+  state                String?
+  postalCode           String?
+  country              String?
+  notes                String?
+  createdAt            DateTime       @default(now())
+  updatedAt            DateTime       @updatedAt
+
+  bills Bill[]
Vendor is missing the archivedAt field even though the docs/plan describe archiving vendors via archivedAt (and the schema already supports it for Bill). Add archivedAt DateTime? (and an index if it will be filtered) or update the docs to match the implemented model.

In backend/prisma/schema.prisma:

> +  lineItems BillLineItem[]
+  approvals Approval[]
+  payment   Payment?
+
+  @@unique([vendorId, invoiceNumber])
+  @@index([status])
+  @@index([dueDate])
+  @@index([createdAt])
+  @@index([archivedAt])
+}
The implementation plan calls out indexing vendorId on Bill for common filtering/sorting paths, but the schema currently has no @@index([vendorId]). Add an index on vendorId to avoid slow vendor-filter queries as the dataset grows.

In backend/eslint.config.mjs:

> +    rules: {
+      '@typescript-eslint/no-explicit-any': 'off',
+      '@typescript-eslint/no-floating-promises': 'warn',
+      '@typescript-eslint/no-unsafe-argument': 'warn',
+      "prettier/prettier": ["error", { endOfLine: "auto" }],
+    },
This ESLint config disables @typescript-eslint/no-explicit-any, which conflicts with the repo rule "no any in TypeScript" in CLAUDE.md. Re-enable this rule (or enforce equivalently) so the stated quality bar is actually checked in CI/local lint.

In backend/prisma/seed.ts:

> +async function main(): Promise<void> {
+  console.log('Wiping existing data...');
+  await wipe();
+  console.log('Seeding users...');
+  await seedUsers();
+  console.log('Seeding vendors...');
+  const vendorIds = await seedVendors();
+  console.log('Seeding bills...');
+  await seedBills(vendorIds);
+
+  const counts = {
+    users: await prisma.user.count(),
+    vendors: await prisma.vendor.count(),
+    bills: await prisma.bill.count(),
+    lineItems: await prisma.billLineItem.count(),
+    approvals: await prisma.approval.count(),
+    payments: await prisma.payment.count(),
+    activity: await prisma.activityLog.count(),
+  };
+  console.log('Seed complete:', counts);
+}
The seed script uses console.log, but CLAUDE.md explicitly lists console.log in committed code as a forbidden pattern. Swap these to Nest's Logger (or a small internal logger wrapper) so the repo stays consistent with its stated rules.

In backend/prisma/seed.ts:

> +main()
+  .catch((error) => {
+    console.error(error);
+    process.exit(1);
+  })
The seed script uses console.error in the top-level error handler; this conflicts with the repo's "no console.log" / console usage prohibition in CLAUDE.md. Prefer a consistent logger (e.g., Nest Logger) and keep the exit behavior the same.

In backend/prisma/seed-ids.ts:

> +  admin: 'seeduseradminmariasosa01',
+  approver: 'seeduserapprovercarlos01',
+  viewer: 'seeduserviewerafischer01',
These deterministic seed user IDs are not CUID v2, but CLAUDE.md documents IDs as CUID v2 on the wire (and Bruno relies on these IDs). Consider using pre-generated valid CUID v2 values for these seeded users (still deterministic) or explicitly document the exception so clients don't assume CUID format for user IDs.

In backend/prisma/seed.ts:

> +  const bill = await prisma.bill.create({
+    data: {
+      invoiceNumber: spec.invoiceNumber,
+      status: spec.status,
+      vendorId,
+      createdById: SEED_USER_IDS.admin,
+      description: spec.description,
+      amount: dec(spec.amount),
+      currency: 'USD',
createdById is always set to the Admin seed user, but the PR description/docs call out splitting creator attribution across Admin and Approver for a more realistic multi-actor dataset. Consider varying createdById (and matching bill.created actor) for some bills to reflect that intent.

In backend/prisma/seed.ts:

> +  await prisma.activityLog.create({
+    data: {
+      entityType: ActivityEntityType.PAYMENT,
+      entityId: payment.id,
+      actorId: SEED_USER_IDS.admin,
+      actorRole: Role.ADMIN,
+      action: 'payment.created',
+      toStatus: PaymentStatus.UNSCHEDULED,
+      createdAt: approvedAt,
+    },
+  });
payment.created is logged with toStatus: UNSCHEDULED even though the Payment row may be created with a different status (SCHEDULED/PAID via paymentStatusFor). This makes the activity trail inconsistent with the seeded Payment.status; set the log toStatus to the actual initial payment status (or create the payment as UNSCHEDULED and then update+log transitions in order).