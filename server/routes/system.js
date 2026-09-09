import { Router } from "express";
import { env } from "../env.js";
import { pushConfigured } from "../lib/push.js";
import { prisma } from "../prisma.js";
import { runBirthdayJob } from "../jobs/birthday-job.js";
import { civilToday, dayKey } from "../lib/dates.js";

export const systemRouter = Router();

/**
 * GET /api/health — Railway's health check target.
 * Reports the database, but stays 200 while the DB is briefly unavailable would
 * be wrong: a container that cannot reach Postgres should not take traffic.
 */
systemRouter.get("/health", async (req, res) => {
  const today = civilToday(env.timeZone);
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({
      status: "ok",
      database: "connected",
      pushConfigured,
      timeZone: env.timeZone,
      today: dayKey(today),
      containerTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      notifyHour: env.notifyHour,
      uptimeSeconds: Math.round(process.uptime()),
    });
  } catch (error) {
    res.status(503).json({ status: "degraded", database: "unreachable", error: error.message });
  }
});

/** GET /api/runs — the last few daily job runs, for debugging a missed day. */
systemRouter.get("/runs", async (req, res) => {
  const runs = await prisma.notificationRun.findMany({
    orderBy: { runDate: "desc" },
    take: 14,
  });
  res.json({ timeZone: env.timeZone, notifyHour: env.notifyHour, runs });
});

/**
 * POST /api/runs/today — run the daily job right now.
 * Without `?force=1` this is the same idempotent job the scheduler runs, so it
 * is safe to hit twice; with it, the day's guard is bypassed for testing.
 */
systemRouter.post("/runs/today", async (req, res) => {
  const force = req.query.force === "1";
  const result = await runBirthdayJob({ trigger: force ? "manual-force" : "manual", force });
  res.json(result);
});
