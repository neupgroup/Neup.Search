UPDATE "domains"
SET "status" = 'Requested'
WHERE "status" = 'Pending'
  AND "details"->>'currentActivity' = 'Queued for crawl.';

ALTER TABLE "domains"
DROP COLUMN IF EXISTS "crawlRequested";
