ALTER TABLE "Links" RENAME TO "Resources";
ALTER TABLE "Resources" ADD COLUMN "type" TEXT NOT NULL DEFAULT 'link';
ALTER TABLE "Resources" ALTER COLUMN "type" DROP DEFAULT;
ALTER TABLE "Resources" ADD COLUMN "metadata" JSONB;

DROP INDEX "Links_linkFrom_linkTo_fromDomain_toDomain_key";
CREATE UNIQUE INDEX "Resources_linkFrom_linkTo_fromDomain_toDomain_type_key" ON "Resources"("linkFrom", "linkTo", "fromDomain", "toDomain", "type");
CREATE INDEX "Resources_type_idx" ON "Resources"("type");

ALTER INDEX "Links_firstCrawlOn_idx" RENAME TO "Resources_firstCrawlOn_idx";
ALTER INDEX "Links_fromDomain_idx" RENAME TO "Resources_fromDomain_idx";
ALTER INDEX "Links_toDomain_idx" RENAME TO "Resources_toDomain_idx";
ALTER INDEX "Links_sourcePageId_idx" RENAME TO "Resources_sourcePageId_idx";
ALTER INDEX "Links_targetPageId_idx" RENAME TO "Resources_targetPageId_idx";
ALTER INDEX "Links_sourceType_idx" RENAME TO "Resources_sourceType_idx";
ALTER INDEX "Links_linkFrom_idx" RENAME TO "Resources_linkFrom_idx";
ALTER INDEX "Links_linkTo_idx" RENAME TO "Resources_linkTo_idx";
ALTER TABLE "Resources" RENAME CONSTRAINT "Links_fromDomain_fkey" TO "Resources_fromDomain_fkey";
ALTER TABLE "Resources" RENAME CONSTRAINT "Links_toDomain_fkey" TO "Resources_toDomain_fkey";

UPDATE "page" AS page
SET "details" = COALESCE(page."details", '{}'::jsonb) || jsonb_build_object(
  'summary', (SELECT entries.value->>'summary' FROM unnest(page."data") AS entries(value) WHERE entries.value->>'kind' = 'summary' LIMIT 1)
)
WHERE EXISTS (SELECT 1 FROM unnest(page."data") AS entries(value) WHERE entries.value->>'kind' = 'summary' AND entries.value->>'summary' IS NOT NULL);

WITH page_resources AS (
  SELECT page."id" AS source_page_id, page."domainId" AS source_domain_id, page."url" AS source_url,
         'image' AS resource_type,
         COALESCE(resource_item.value->>'src', resource_item.value->>'url') AS target_url,
         resource_item.value->>'caption' AS caption
  FROM "page" AS page
  CROSS JOIN LATERAL unnest(page."data") AS entry(value)
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(entry.value->'images', '[]'::jsonb)) AS resource_item(value)
  UNION ALL
  SELECT page."id", page."domainId", page."url", 'video', resource_item.value->>'video', resource_item.value->>'caption'
  FROM "page" AS page
  CROSS JOIN LATERAL unnest(page."data") AS entry(value)
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(entry.value->'videos', '[]'::jsonb)) AS resource_item(value)
), normalized_resources AS (
  SELECT source_page_id, source_domain_id, source_url, resource_type,
         CASE
           WHEN target_url ~* '^https?://' THEN target_url
           WHEN target_url LIKE '/%' THEN regexp_replace(source_url, '^((https?://[^/]+)).*$', '\1') || target_url
           ELSE NULL
         END AS target_url,
         caption
  FROM page_resources
  WHERE resource_type IS NOT NULL AND target_url IS NOT NULL
)
INSERT INTO "Resources" ("id", "type", "linkFrom", "linkTo", "fromDomain", "toDomain", "sourcePageId", "sourceType", "anchorText")
SELECT gen_random_uuid()::text, resource.resource_type, resource.source_url, resource.target_url,
       resource.source_domain_id, target_domain."id", resource.source_page_id, resource.resource_type, resource.caption
FROM normalized_resources AS resource
JOIN "domains" AS target_domain ON lower(target_domain."domain") = lower(substring(resource.target_url from '^https?://([^/:?#]+)'))
ON CONFLICT ("linkFrom", "linkTo", "fromDomain", "toDomain", "type") DO NOTHING;

INSERT INTO "page" ("id", "domainId", "url", "title", "type", "details", "status", "discoveredOn")
SELECT gen_random_uuid()::text, resource."toDomain", resource."linkTo", NULL, resource."type", '{}'::jsonb, 'discovered', CURRENT_TIMESTAMP
FROM "Resources" AS resource
WHERE resource."type" IN ('image', 'video', 'audio', 'iframe')
  AND NOT EXISTS (
    SELECT 1 FROM "page" AS target_page
    WHERE target_page."domainId" = resource."toDomain" AND target_page."url" = resource."linkTo"
  );

UPDATE "Resources" AS resource
SET "targetPageId" = target_page."id"
FROM "page" AS target_page
WHERE resource."type" IN ('image', 'video', 'audio', 'iframe')
  AND target_page."domainId" = resource."toDomain"
  AND target_page."url" = resource."linkTo";

ALTER TABLE "page" DROP COLUMN "data";
