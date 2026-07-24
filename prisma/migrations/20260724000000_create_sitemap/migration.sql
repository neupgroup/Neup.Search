CREATE TABLE "sitemap" (
  "id" TEXT NOT NULL,
  "siteId" TEXT NOT NULL,
  "sitemapUrl" TEXT NOT NULL,
  "referrer" TEXT,
  "addedOn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "sitemap_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sitemap_siteId_sitemapUrl_key" ON "sitemap"("siteId", "sitemapUrl");
CREATE INDEX "sitemap_addedOn_idx" ON "sitemap"("addedOn");
CREATE INDEX "sitemap_siteId_idx" ON "sitemap"("siteId");
CREATE INDEX "sitemap_sitemapUrl_idx" ON "sitemap"("sitemapUrl");

ALTER TABLE "sitemap" ADD CONSTRAINT "sitemap_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "domains"("id") ON DELETE CASCADE ON UPDATE CASCADE;
