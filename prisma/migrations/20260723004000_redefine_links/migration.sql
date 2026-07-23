DROP TABLE IF EXISTS "Links";

CREATE TABLE "Links" (
  "id" TEXT NOT NULL,
  "linkFrom" TEXT NOT NULL,
  "linkTo" TEXT NOT NULL,
  "fromDomain" TEXT NOT NULL,
  "toDomain" TEXT NOT NULL,
  "firstCrawlOn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Links_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Links_linkFrom_linkTo_fromDomain_toDomain_key" ON "Links"("linkFrom", "linkTo", "fromDomain", "toDomain");
CREATE INDEX "Links_firstCrawlOn_idx" ON "Links"("firstCrawlOn");
CREATE INDEX "Links_fromDomain_idx" ON "Links"("fromDomain");
CREATE INDEX "Links_toDomain_idx" ON "Links"("toDomain");
CREATE INDEX "Links_linkFrom_idx" ON "Links"("linkFrom");
CREATE INDEX "Links_linkTo_idx" ON "Links"("linkTo");

ALTER TABLE "Links" ADD CONSTRAINT "Links_fromDomain_fkey" FOREIGN KEY ("fromDomain") REFERENCES "domains"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Links" ADD CONSTRAINT "Links_toDomain_fkey" FOREIGN KEY ("toDomain") REFERENCES "domains"("id") ON DELETE CASCADE ON UPDATE CASCADE;
