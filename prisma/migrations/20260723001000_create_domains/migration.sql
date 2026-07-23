CREATE TABLE "domains" (
  "id" TEXT NOT NULL,
  "domain" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "lastCrawled" TIMESTAMP(3),
  "status" TEXT NOT NULL,
  "addedOn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "details" JSONB,

  CONSTRAINT "domains_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "domains_domain_key" ON "domains"("domain");
CREATE INDEX "domains_addedOn_idx" ON "domains"("addedOn");
CREATE INDEX "domains_status_idx" ON "domains"("status");
