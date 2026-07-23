CREATE TABLE "account" (
  "id" TEXT NOT NULL,
  "connectionId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "neupId" TEXT NOT NULL,
  "displayImage" TEXT,
  "displayName" TEXT NOT NULL,
  "lastActive" TIMESTAMP(3),

  CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "account_connectionId_idx" ON "account"("connectionId");
CREATE INDEX "account_neupId_idx" ON "account"("neupId");
