// Prisma 7 configuration.
// Since v7 the connection URL lives here (and in the PrismaClient adapter),
// not in schema.prisma. This file is what `prisma migrate` / `prisma db push`
// read; the runtime client is built in server/prisma.js.
import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
