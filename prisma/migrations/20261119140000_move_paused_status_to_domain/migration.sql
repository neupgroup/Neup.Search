CREATE TYPE "PageWorkflowStatus" AS ENUM (
  'discovered',
  'requesting',
  'requested',
  'toCrawl',
  'crawling',
  'crawled',
  'analyzing',
  'analyzed',
  'indexed',
  'unlisted',
  'deleting'
);

UPDATE "page"
SET
  "status" = (CASE
    WHEN "details"->>'pausedFromStatus' IN (
      'discovered', 'requesting', 'requested', 'toCrawl', 'crawling',
      'crawled', 'analyzing', 'analyzed', 'indexed', 'unlisted', 'deleting'
    ) THEN "details"->>'pausedFromStatus'
    ELSE 'toCrawl'
  END)::"WorkflowStatus",
  "details" = "details" - 'pausedFromStatus'
WHERE "status" = 'paused';

ALTER TABLE "page"
  ALTER COLUMN "status" TYPE "PageWorkflowStatus"
  USING ("status"::TEXT::"PageWorkflowStatus");
