DO $$
DECLARE
  invalid_statuses TEXT;
BEGIN
  SELECT string_agg(DISTINCT "status", ', ')
  INTO invalid_statuses
  FROM "domains"
  WHERE "status" NOT IN (
    'Requested', 'Pending', 'Active', 'Paused', 'Error',
    'Crawling', 'Crawled', 'Cancelled', 'Stopped'
  );

  IF invalid_statuses IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot convert domains.status to DomainStatus; unknown values: %', invalid_statuses;
  END IF;
END $$;

CREATE TYPE "DomainStatus" AS ENUM (
  'Requested',
  'Pending',
  'Active',
  'Paused',
  'Error',
  'Crawling',
  'Crawled',
  'Cancelled',
  'Stopped'
);

ALTER TABLE "domains"
ALTER COLUMN "status" TYPE "DomainStatus"
USING ("status"::"DomainStatus");

