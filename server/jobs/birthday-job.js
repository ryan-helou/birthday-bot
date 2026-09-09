import cron from "node-cron";
import { env } from "../env.js";
import { prisma } from "../prisma.js";
import { birthdayNotification, sendToAll } from "../lib/push.js";
import {
  ageTurningOn,
  birthdayWhereForToday,
  civilToday,
  dayKey,
} from "../lib/dates.js";

/**
 * Send today's birthday reminders.
 *
 * Idempotent by design: a `NotificationRun` row is claimed for the day before
 * anything is sent, so a container restart, a redeploy, or a second replica
 * cannot double-notify. `force` is for the "Send a test" button only.
 */
export async function runBirthdayJob({ trigger = "cron", force = false } = {}) {
  const today = civilToday(env.timeZone);
  const runDate = dayKey(today);

  if (!force) {
    const existing = await prisma.notificationRun.findUnique({ where: { runDate } });
    if (existing) {
      return { runDate, status: "already-ran", ...summarize(existing) };
    }
  }

  const contacts = await prisma.contact.findMany({
    where: birthdayWhereForToday(today),
    orderBy: { name: "asc" },
  });

  const celebrants = contacts.map((contact) => ({
    id: contact.id,
    name: contact.name,
    turningAge: ageTurningOn(contact, today.year),
  }));

  let sent = 0;
  let failed = 0;
  let removed = 0;

  if (celebrants.length > 0) {
    const payload = birthdayNotification(celebrants, { year: today.year });
    const result = await sendToAll(payload);
    sent = result.sent;
    failed = result.failed;
    removed = result.removed;
  }

  // Claim the day even when there were no birthdays, so the catch-up on boot
  // does not re-query all day. `force` runs are never recorded.
  if (!force) {
    await prisma.notificationRun
      .create({
        data: {
          runDate,
          birthdayCount: celebrants.length,
          sentCount: sent,
          failedCount: failed,
          trigger,
        },
      })
      // A racing replica claimed the same day first — harmless.
      .catch(() => {});
  }

  console.log(
    `[birthday-job] ${runDate} (${env.timeZone}) trigger=${trigger} ` +
      `birthdays=${celebrants.length} sent=${sent} failed=${failed} pruned=${removed}`,
  );

  return {
    runDate,
    status: "ran",
    trigger,
    birthdays: celebrants,
    birthdayCount: celebrants.length,
    sentCount: sent,
    failedCount: failed,
    removedCount: removed,
  };
}

function summarize(run) {
  return {
    birthdayCount: run.birthdayCount,
    sentCount: run.sentCount,
    failedCount: run.failedCount,
    trigger: run.trigger,
  };
}

/**
 * Schedule the daily job at NOTIFY_HOUR:00 in APP_TIMEZONE, and catch up on boot
 * if the process was not alive when today's slot passed — a redeploy at 08:05
 * would otherwise silently skip the day.
 */
export function scheduleBirthdayJob() {
  const expression = `0 ${env.notifyHour} * * *`;

  const task = cron.schedule(
    expression,
    () => {
      runBirthdayJob({ trigger: "cron" }).catch((error) =>
        console.error("[birthday-job] failed:", error),
      );
    },
    { timezone: env.timeZone },
  );

  console.log(
    `[birthday-job] scheduled "${expression}" in ${env.timeZone} ` +
      `(container clock: ${Intl.DateTimeFormat().resolvedOptions().timeZone})`,
  );

  catchUpOnBoot().catch((error) => console.error("[birthday-job] catch-up failed:", error));

  return task;
}

async function catchUpOnBoot() {
  const now = new Date();
  const hourHere = Number(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: env.timeZone,
      hour: "2-digit",
      hour12: false,
    }).format(now),
  );

  if (hourHere < env.notifyHour) return; // the scheduled run is still ahead of us
  const result = await runBirthdayJob({ trigger: "catch-up" });
  if (result.status === "ran") {
    console.log(`[birthday-job] caught up on ${result.runDate} after boot`);
  }
}
