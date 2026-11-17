ALTER TABLE "domains"
ADD COLUMN "crawlWorkerId" TEXT,
ADD COLUMN "crawlLeaseUntil" TIMESTAMP(3);

CREATE INDEX "domains_status_crawlLeaseUntil_idx"
ON "domains"("status", "crawlLeaseUntil");
