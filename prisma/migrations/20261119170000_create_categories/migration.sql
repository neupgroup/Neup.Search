CREATE TYPE "CategoryType" AS ENUM ('page', 'site');

CREATE TABLE "categories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "type" "CategoryType" NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" UUID,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "categories_type_idx" ON "categories"("type");
CREATE INDEX "categories_parentId_idx" ON "categories"("parentId");

ALTER TABLE "categories"
ADD CONSTRAINT "categories_parentId_fkey"
FOREIGN KEY ("parentId") REFERENCES "categories"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
