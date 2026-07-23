CREATE TABLE "page" (
  "id" TEXT NOT NULL,
  "domainId" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "title" TEXT,
  "description" TEXT,
  "type" TEXT NOT NULL,
  "data" JSONB[] NOT NULL DEFAULT ARRAY[]::JSONB[],
  "fullContent" TEXT,
  "status" TEXT NOT NULL,
  "statusCode" INTEGER,
  "addedOn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastCrawled" TIMESTAMP(3),

  CONSTRAINT "page_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "page_addedOn_idx" ON "page"("addedOn");
CREATE INDEX "page_domainId_idx" ON "page"("domainId");
CREATE INDEX "page_status_idx" ON "page"("status");
CREATE INDEX "page_url_idx" ON "page"("url");

ALTER TABLE "page" ADD CONSTRAINT "page_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "domains"("id") ON DELETE CASCADE ON UPDATE CASCADE;
