DROP INDEX IF EXISTS "page_addedOn_idx";

ALTER TABLE "page"
DROP COLUMN "addedOn",
DROP COLUMN "crawlWorkerId";

CREATE INDEX "page_discoveredOn_idx" ON "page"("discoveredOn");
