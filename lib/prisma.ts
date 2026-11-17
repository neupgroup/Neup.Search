import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// Keep each application or worker process within a small, explicit PostgreSQL connection budget.
function limitDatabaseConnectionPool(databaseUrl: string | undefined): string | undefined {
  if (!databaseUrl) return databaseUrl;

  try {
    const parsedUrl = new URL(databaseUrl);
    if (!parsedUrl.searchParams.has("connection_limit")) {
      parsedUrl.searchParams.set("connection_limit", process.env.PRISMA_CONNECTION_LIMIT ?? "2");
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
    datasources: { db: { url: limitDatabaseConnectionPool(process.env.DATABASE_URL) } },
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
