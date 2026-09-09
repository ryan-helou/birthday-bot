import { Router } from "express";
import { prisma } from "../prisma.js";
import { env } from "../env.js";
import { pushConfigured, sendToAll } from "../lib/push.js";

export const subscriptionsRouter = Router();

/** The client needs the public key before it can call pushManager.subscribe(). */
subscriptionsRouter.get("/public-key", (req, res) => {
  if (!pushConfigured) {
    return res.status(503).json({
      error: "Push is not configured. Set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY.",
    });
  }
  res.json({ publicKey: env.vapid.publicKey });
});

function readSubscription(body) {
  const subscription = body?.subscription ?? body;
  const endpoint = subscription?.endpoint;
  const p256dh = subscription?.keys?.p256dh;
  const auth = subscription?.keys?.auth;
  if (typeof endpoint !== "string" || !endpoint.startsWith("http")) return null;
  if (typeof p256dh !== "string" || typeof auth !== "string") return null;
  return { endpoint, p256dh, auth };
}

/**
 * POST /api/subscriptions
 * Upsert on `endpoint`: a browser that re-subscribes (after a permission reset,
 * a new service worker, or a reinstall) must update its row, never add a second
 * one — duplicates would mean duplicate notifications on the same device.
 */
subscriptionsRouter.post("/", async (req, res) => {
  const parsed = readSubscription(req.body);
  if (!parsed) {
    return res.status(400).json({ error: "Expected a PushSubscription with endpoint and keys." });
  }

  const label = typeof req.body?.label === "string" ? req.body.label.slice(0, 80) : null;
  const userAgent = req.get("user-agent")?.slice(0, 255) ?? null;

  const subscription = await prisma.subscription.upsert({
    where: { endpoint: parsed.endpoint },
    create: { ...parsed, userAgent, label },
    update: { ...parsed, userAgent, label, failureCount: 0, lastSeenAt: new Date() },
  });

  res.status(201).json({ id: subscription.id, endpoint: subscription.endpoint });
});

/** POST /api/subscriptions/unsubscribe — body: { endpoint }. */
subscriptionsRouter.post("/unsubscribe", async (req, res) => {
  const endpoint = req.body?.endpoint ?? req.body?.subscription?.endpoint;
  if (typeof endpoint !== "string") return res.status(400).json({ error: "endpoint is required" });
  await prisma.subscription.deleteMany({ where: { endpoint } });
  res.status(204).end();
});

/** GET /api/subscriptions — how many devices are registered (no secrets). */
subscriptionsRouter.get("/", async (req, res) => {
  const rows = await prisma.subscription.findMany({
    select: { id: true, userAgent: true, label: true, createdAt: true, lastSeenAt: true, failureCount: true },
    orderBy: { createdAt: "desc" },
  });
  res.json({ count: rows.length, pushConfigured, subscriptions: rows });
});

/** POST /api/subscriptions/test — prove the whole push path works, now. */
subscriptionsRouter.post("/test", async (req, res) => {
  if (!pushConfigured) return res.status(503).json({ error: "Push is not configured." });
  const result = await sendToAll({
    title: "Birthday Bot",
    body: "Notifications are working. You'll hear from me at 8:00 AM on the day.",
    tag: "birthday-bot-test",
    url: "/",
  });
  res.json(result);
});
