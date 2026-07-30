ALTER TABLE "Links" ADD COLUMN "sourcePageId" TEXT;
ALTER TABLE "Links" ADD COLUMN "targetPageId" TEXT;
ALTER TABLE "Links" ADD COLUMN "sourceType" TEXT;
ALTER TABLE "Links" ADD COLUMN "anchorText" TEXT;
ALTER TABLE "Links" ADD COLUMN "altText" TEXT;
ALTER TABLE "Links" ADD COLUMN "titleText" TEXT;
ALTER TABLE "Links" ADD COLUMN "rel" TEXT;

CREATE INDEX "Links_sourcePageId_idx" ON "Links"("sourcePageId");
CREATE INDEX "Links_targetPageId_idx" ON "Links"("targetPageId");
CREATE INDEX "Links_sourceType_idx" ON "Links"("sourceType");
