import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { env } from "./env.js";

// Prisma 7 takes its connection through a driver adapter rather than a URL in
// schema.prisma. One pool for the process; `globalThis` keeps it a singleton
// across dev reloads.
const globalForPrisma = globalThis;

export const prisma =
  globalForPrisma.__birthdayBotPrisma ??
  new PrismaClient({
    adapter: new PrismaPg({ connectionString: env.databaseUrl }),
    log: env.isProduction ? ["warn", "error"] : ["warn", "error"],
  });

if (!env.isProduction) globalForPrisma.__birthdayBotPrisma = prisma;
