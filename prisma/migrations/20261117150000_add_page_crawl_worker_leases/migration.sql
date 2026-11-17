ALTER TABLE "page"
ADD COLUMN "crawlWorkerId" TEXT,
ADD COLUMN "crawlLeaseUntil" TIMESTAMP(3);

CREATE INDEX "page_status_crawlLeaseUntil_idx"
ON "page"("status", "crawlLeaseUntil");
