CREATE TABLE "Links" (
  "id" TEXT NOT NULL,
  "sourceDomainId" TEXT NOT NULL,
  "targetDomainId" TEXT NOT NULL,
  "sourcePageId" TEXT,
  "targetPageId" TEXT,
  "sourceUrl" TEXT NOT NULL,
  "targetUrl" TEXT NOT NULL,
  "anchorText" TEXT,
  "rel" TEXT,
  "type" TEXT NOT NULL,
  "addedOn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Links_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Links_addedOn_idx" ON "Links"("addedOn");
CREATE INDEX "Links_sourceDomainId_idx" ON "Links"("sourceDomainId");
CREATE INDEX "Links_targetDomainId_idx" ON "Links"("targetDomainId");
CREATE INDEX "Links_sourcePageId_idx" ON "Links"("sourcePageId");
CREATE INDEX "Links_targetPageId_idx" ON "Links"("targetPageId");
CREATE INDEX "Links_targetUrl_idx" ON "Links"("targetUrl");

ALTER TABLE "Links" ADD CONSTRAINT "Links_sourceDomainId_fkey" FOREIGN KEY ("sourceDomainId") REFERENCES "domains"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Links" ADD CONSTRAINT "Links_targetDomainId_fkey" FOREIGN KEY ("targetDomainId") REFERENCES "domains"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Links" ADD CONSTRAINT "Links_sourcePageId_fkey" FOREIGN KEY ("sourcePageId") REFERENCES "page"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Links" ADD CONSTRAINT "Links_targetPageId_fkey" FOREIGN KEY ("targetPageId") REFERENCES "page"("id") ON DELETE SET NULL ON UPDATE CASCADE;
