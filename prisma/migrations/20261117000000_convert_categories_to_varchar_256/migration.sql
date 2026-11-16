ALTER TABLE "domains"
ALTER COLUMN "categories" DROP DEFAULT,
ALTER COLUMN "categories" DROP NOT NULL;

ALTER TABLE "domains"
ALTER COLUMN "categories" TYPE VARCHAR(256)
USING LEFT("categories"[1], 256);
