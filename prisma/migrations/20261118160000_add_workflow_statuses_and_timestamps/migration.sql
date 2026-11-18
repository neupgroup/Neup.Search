CREATE TYPE "WorkflowStatus" AS ENUM (
  'discovered',
  'crawling',
  'crawled',
  'analyzing',
  'analyzed',
  'indexed'
);

ALTER TABLE "page" ADD COLUMN "discoveredOn" TIMESTAMP(3), ADD COLUMN "analyzedOn" TIMESTAMP(3), ADD COLUMN "crawledOn" TIMESTAMP(3);
ALTER TABLE "domains" ADD COLUMN "analyzedOn" TIMESTAMP(3);

UPDATE "page"
SET "details" = jsonb_set(
  COALESCE("details", '{}'::jsonb),
  '{crawlResultStatus}',
  to_jsonb("status"),
  true
)
WHERE "status" IN ('Indexed', 'Error', 'Skipped', 'Redirect');
UPDATE "page"
SET "details" = jsonb_set(COALESCE("details", '{}'::jsonb), '{crawlResultStatus}', '"Indexed"'::jsonb, true)
WHERE "status" IN ('reported-errors', 'saved-content');

UPDATE "page"
SET "status" = CASE
  WHEN "status" IN ('crawling-page') THEN 'crawling'
  WHEN "status" IN ('saved-content', 'reported-errors') THEN 'crawled'
  WHEN "status" IN ('analyzing-page') THEN 'analyzing'
  WHEN "status" IN ('completed-flow', 'analyzed') THEN 'analyzed'
  WHEN "status" IN ('Indexed', 'indexed') THEN 'indexed'
  WHEN "status" IN ('Pending', 'discovered-page', 'discovered') THEN 'discovered'
  ELSE 'crawled'
END;
UPDATE "page"
SET "discoveredOn" = "addedOn",
    "crawledOn" = "lastCrawled",
    "analyzedOn" = CASE WHEN "status" IN ('analyzed', 'indexed') THEN COALESCE("lastCrawled", CURRENT_TIMESTAMP) ELSE NULL END;

ALTER TABLE "domains" ALTER COLUMN "status" TYPE TEXT USING ("status"::TEXT);
UPDATE "domains"
SET "status" = CASE
  WHEN "status" IN ('Crawling', 'crawling') THEN 'crawling'
  WHEN "status" IN ('Active', 'Crawled', 'crawled', 'indexed') THEN 'crawled'
  WHEN "status" IN ('Analyzing', 'analyzing') THEN 'analyzing'
  WHEN "status" IN ('Analyzed', 'analyzed') THEN 'analyzed'
  ELSE 'discovered'
END;

ALTER TABLE "page" ALTER COLUMN "status" TYPE "WorkflowStatus" USING ("status"::"WorkflowStatus");
ALTER TABLE "page" ALTER COLUMN "discoveredOn" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "page" ALTER COLUMN "discoveredOn" SET NOT NULL;
ALTER TABLE "domains" ALTER COLUMN "status" TYPE "WorkflowStatus" USING ("status"::"WorkflowStatus");
DROP TYPE "DomainStatus";
