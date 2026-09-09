import webpush from "web-push";
import { env, vapidKeysPresent as keysPresent } from "../env.js";
import { prisma } from "../prisma.js";

/**
 * web-push validates the keypair here and THROWS on a malformed one. Left
 * unguarded that happens at import time, so one mistyped Railway variable takes
 * down the entire process — health check included — instead of just disabling
 * notifications. Degrade to "push off" and say so loudly.
 */
function configurePush() {
  if (!keysPresent) {
    console.warn("[push] VAPID keys are not set — notifications are disabled.");
    return false;
  }
  try {
    webpush.setVapidDetails(env.vapid.subject, env.vapid.publicKey, env.vapid.privateKey);
    return true;
  } catch (error) {
    console.error(
      `[push] VAPID keys are invalid, so notifications are disabled: ${error.message}\n` +
        "        Regenerate them with `npm run vapid` and update the environment.",
    );
    return false;
  }
}

export const pushConfigured = configurePush();

/** Endpoints the push service has told us are permanently dead. */
const GONE_STATUS = new Set([404, 410]);

/** Consecutive soft failures after which we stop keeping the row around. */
const MAX_FAILURES = 5;

function toWebPushSubscription(row) {
  return { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } };
}

/**
 * Send one payload to every stored device.
 *
 * Dead endpoints are deleted rather than retried — a push subscription is
 * invalidated whenever the user clears site data or reinstalls the PWA, and a
 * stale row otherwise fails forever.
 */
export async function sendToAll(payload, { subscriptions } = {}) {
  if (!pushConfigured) {
    return { sent: 0, failed: 0, removed: 0, skipped: "VAPID keys are not configured" };
  }

  const rows = subscriptions ?? (await prisma.subscription.findMany());
  if (rows.length === 0) return { sent: 0, failed: 0, removed: 0 };

  const body = JSON.stringify(payload);
  let sent = 0;
  let failed = 0;
  let removed = 0;

  const results = await Promise.allSettled(
    rows.map(async (row) => {
      try {
        await webpush.sendNotification(toWebPushSubscription(row), body, { TTL: 24 * 60 * 60 });
        if (row.failureCount > 0) {
          await prisma.subscription.update({
            where: { id: row.id },
            data: { failureCount: 0, lastSeenAt: new Date() },
          });
        }
        return { ok: true };
      } catch (error) {
        const status = error?.statusCode;
        if (GONE_STATUS.has(status) || row.failureCount + 1 >= MAX_FAILURES) {
          await prisma.subscription.delete({ where: { id: row.id } }).catch(() => {});
          return { ok: false, removed: true, status };
        }
        await prisma.subscription
          .update({ where: { id: row.id }, data: { failureCount: { increment: 1 } } })
          .catch(() => {});
        return { ok: false, removed: false, status };
      }
    }),
  );

  for (const result of results) {
    const value = result.status === "fulfilled" ? result.value : { ok: false };
    if (value.ok) sent += 1;
    else {
      failed += 1;
      if (value.removed) removed += 1;
    }
  }

  return { sent, failed, removed };
}

/**
 * Notification copy. Plain text, no emoji — the age is omitted when the birth
 * year was never known (a month/day-only import).
 */
export function birthdayNotification(contacts, { year }) {
  const [first] = contacts;
  const describe = (contact) =>
    contact.turningAge != null
      ? `It's ${contact.name}'s birthday today! They are turning ${contact.turningAge}.`
      : `It's ${contact.name}'s birthday today!`;

  if (contacts.length === 1) {
    return {
      title: "Birthday today",
      body: describe(first),
      tag: `birthday-${year}-${first.id}`,
      url: `/?contact=${first.id}`,
      renotify: false,
    };
  }

  return {
    title: `${contacts.length} birthdays today`,
    body: contacts
      .map((c) => (c.turningAge != null ? `${c.name} (${c.turningAge})` : c.name))
      .join(", "),
    tag: `birthday-${year}-multi`,
    url: "/",
    renotify: false,
  };
}
