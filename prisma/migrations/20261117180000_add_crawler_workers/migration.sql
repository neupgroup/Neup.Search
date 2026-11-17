CREATE TYPE "CrawlerWorkerStatus" AS ENUM ('Starting', 'Idle', 'Working', 'Stopped', 'Error');

CREATE TABLE "crawler_workers" (
    "id" TEXT NOT NULL,
    "status" "CrawlerWorkerStatus" NOT NULL,
    "activity" TEXT NOT NULL,
    "siteId" TEXT,
    "siteUrl" TEXT,
    "currentUrl" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "crawler_workers_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "crawler_workers_lastSeenAt_idx" ON "crawler_workers"("lastSeenAt");
CREATE INDEX "crawler_workers_status_lastSeenAt_idx" ON "crawler_workers"("status", "lastSeenAt");

ALTER TABLE "crawler_workers"
ADD CONSTRAINT "crawler_workers_siteId_fkey"
FOREIGN KEY ("siteId") REFERENCES "domains"("id") ON DELETE SET NULL ON UPDATE CASCADE;

