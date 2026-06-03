-- Backfill any existing NULL rows to 'ACH' before tightening the column,
-- so the NOT NULL constraint can be applied without losing data. ACH is
-- the historical fallback this migration is removing from the approve
-- flow; this preserves prior behaviour for vendors that were created
-- without an explicit default.
UPDATE "Vendor" SET "defaultPaymentMethod" = 'ACH' WHERE "defaultPaymentMethod" IS NULL;

-- AlterTable
ALTER TABLE "Vendor" ALTER COLUMN "defaultPaymentMethod" SET NOT NULL;
