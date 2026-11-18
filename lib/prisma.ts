import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// Configure a PostgreSQL pool for the concurrent local crawler and analysis workers.
function configureDatabaseConnectionPool(databaseUrl: string | undefined): string | undefined {
  if (!databaseUrl) return databaseUrl;

  try {
    const parsedUrl = new URL(databaseUrl);
    if (!parsedUrl.searchParams.has("connection_limit")) {
      parsedUrl.searchParams.set("connection_limit", process.env.PRISMA_CONNECTION_LIMIT ?? "10");
    }
    if (!parsedUrl.searchParams.has("pool_timeout")) {
      parsedUrl.searchParams.set("pool_timeout", process.env.PRISMA_POOL_TIMEOUT ?? "20");
    }
    return parsedUrl.toString();
  } catch {
    console.warn("[prisma] DATABASE_URL is not a valid URL; using Prisma's default connection pool.");
    return databaseUrl;
  }
}

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: { db: { url: configureDatabaseConnectionPool(process.env.DATABASE_URL) } },
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
