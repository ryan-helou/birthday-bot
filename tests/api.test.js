/**
 * Integration tests against a real PostgreSQL database.
 *
 * Set TEST_DATABASE_URL (or let it default to a local birthday_bot_test) and run
 * `npx prisma migrate deploy` against it once. If no database is reachable the
 * whole file skips with a reason rather than failing a fresh clone's `npm test`.
 */
import test from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://localhost:5432/birthday_bot_test";
process.env.APP_TIMEZONE = "America/Toronto";
process.env.NODE_ENV = "test";
// A keypair generated for this file only — the tests never reach a push service.
process.env.VAPID_PUBLIC_KEY =
  "BJxBt-0nrTgnMcyi7wtDVCFVwUyRnJNTeuGrKUYEhz8Cs4YuvOtBPFKXqZ2sV2sTMMSDdBHhaWQpb-h4YU3nWZo";
process.env.VAPID_PRIVATE_KEY = "kBP4oEFObl3-Bxq8U2rRV1WqNYzKBnZzc9dJbcqLbXQ";
process.env.VAPID_SUBJECT = "mailto:test@example.com";

const { prisma } = await import("../server/prisma.js");
const { createApp } = await import("../server/index.js");
const { runBirthdayJob } = await import("../server/jobs/birthday-job.js");
const { civilToday, dayKey } = await import("../server/lib/dates.js");

let reachable = true;
try {
  await prisma.$queryRaw`SELECT 1`;
} catch (error) {
  reachable = false;
  console.error(`\n[api.test] skipping: ${error.message}\n`);
}

const dbTest = (name, fn) =>
  test(name, { skip: reachable ? false : "no test database reachable" }, fn);

let server;
let base;

test.before(async () => {
  if (!reachable) return;
  server = createApp().listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.beforeEach(async () => {
  if (!reachable) return;
  await prisma.notificationRun.deleteMany();
  await prisma.subscription.deleteMany();
  await prisma.contact.deleteMany();
});

test.after(async () => {
  server?.close();
  await prisma.$disconnect().catch(() => {});
});

const call = async (path, options) => {
  const response = await fetch(`${base}${path}`, {
    headers: options?.body instanceof FormData ? undefined : { "Content-Type": "application/json" },
    ...options,
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
};

const today = () => civilToday("America/Toronto");

/** A birthdate string whose month/day is `offset` days from today. */
function birthdayInDays(offset, year = 1999) {
  const t = today();
  const date = new Date(Date.UTC(t.year, t.month - 1, t.day + offset));
  return `${year}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

/* ------------------------------- health ------------------------------- */

dbTest("GET /api/health reports the app timezone, not the container's", async () => {
  const { status, body } = await call("/api/health");
  assert.equal(status, 200);
  assert.equal(body.database, "connected");
  assert.equal(body.timeZone, "America/Toronto");
  assert.equal(body.today, dayKey(today()));
  assert.equal(body.pushConfigured, true);
});

/* ------------------------------ contacts ------------------------------ */

dbTest("contacts CRUD round-trips and derives the countdown", async () => {
  const created = await call("/api/contacts", {
    method: "POST",
    body: JSON.stringify({ name: "Ava Bennett", birthdate: birthdayInDays(3, 1999), notes: "camp" }),
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.daysUntil, 3);
  assert.equal(created.body.turningAge, today().year - 1999 + (created.body.nextBirthdayYear > today().year ? 1 : 0));

  const listed = await call("/api/contacts");
  assert.equal(listed.body.count, 1);

  const updated = await call(`/api/contacts/${created.body.id}`, {
    method: "PUT",
    body: JSON.stringify({ name: "Ava B.", birthdate: birthdayInDays(3, 1999), notes: "" }),
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.name, "Ava B.");
  assert.equal(updated.body.notes, null);

  assert.equal((await call(`/api/contacts/${created.body.id}`, { method: "DELETE" })).status, 204);
  assert.equal((await call(`/api/contacts/${created.body.id}`)).status, 404);
});

dbTest("a bad birthdate is a 400, not a 500 or a silently wrong row", async () => {
  const { status, body } = await call("/api/contacts", {
    method: "POST",
    body: JSON.stringify({ name: "Ava", birthdate: "not a date" }),
  });
  assert.equal(status, 400);
  assert.match(body.error, /birthdate/);
  assert.equal(await prisma.contact.count(), 0);
});

dbTest("the same person and birthday cannot be saved twice", async () => {
  const payload = JSON.stringify({ name: "Ava", birthdate: "1999-03-14" });
  assert.equal((await call("/api/contacts", { method: "POST", body: payload })).status, 201);
  const second = await call("/api/contacts", { method: "POST", body: payload });
  assert.equal(second.status, 409);
});

dbTest("the list is ordered by how soon the birthday is, not by date", async () => {
  for (const [name, offset] of [["Later", 200], ["Soon", 1], ["Today", 0]]) {
    await call("/api/contacts", {
      method: "POST",
      body: JSON.stringify({ name, birthdate: birthdayInDays(offset, 1990) }),
    });
  }
  const { body } = await call("/api/contacts");
  assert.deepEqual(body.contacts.map((c) => c.name), ["Today", "Soon", "Later"]);
  assert.deepEqual(body.contacts.map((c) => c.daysUntil), [0, 1, 200]);
});

/* -------------------------------- import ------------------------------- */

dbTest("a dry-run import writes nothing and reports what would land", async () => {
  const form = new FormData();
  form.append("file", new Blob(["Name,Birthday\nAva,03/14/1999\nLeo,12-25\nBad,nope\n"]), "friends.csv");
  const { status, body } = await call("/api/import?dryRun=1", { method: "POST", body: form });

  assert.equal(status, 200);
  assert.equal(body.dryRun, true);
  assert.equal(body.willImport, 2);
  assert.equal(body.skipped.length, 1);
  assert.equal(await prisma.contact.count(), 0, "a dry run must not write");
});

dbTest("importing twice does not duplicate anyone", async () => {
  const upload = () => {
    const form = new FormData();
    form.append("file", new Blob(["Name,Birthday\nAva,03/14/1999\nLeo,12-25\n"]), "friends.csv");
    return call("/api/import", { method: "POST", body: form });
  };

  const first = await upload();
  assert.equal(first.body.created, 2);

  const second = await upload();
  assert.equal(second.body.created, 0);
  assert.equal(await prisma.contact.count(), 2);
});

dbTest("a year-less re-import never erases a birth year we already knew", async () => {
  await call("/api/contacts", {
    method: "POST",
    body: JSON.stringify({ name: "Ava", birthdate: "1999-03-14", notes: "hand typed" }),
  });

  const form = new FormData();
  form.append("file", new Blob(["Name,Birthday,Notes\nAva,3/14,from export\n"]), "friends.csv");
  await call("/api/import", { method: "POST", body: form });

  const contact = await prisma.contact.findFirst({ where: { name: "Ava" } });
  assert.equal(contact.yearKnown, true, "the known year must survive a month/day-only import");
  assert.equal(contact.birthdate.toISOString().slice(0, 10), "1999-03-14");
  assert.equal(contact.notes, "hand typed", "hand-typed notes must not be overwritten");
});

dbTest("a month/day-only contact is later completed by an import that has the year", async () => {
  await call("/api/contacts", { method: "POST", body: JSON.stringify({ name: "Leo", birthdate: "6/30" }) });

  const form = new FormData();
  form.append("file", new Blob(["Name,Birthday\nLeo,1998-06-30\n"]), "friends.csv");
  const { body } = await call("/api/import", { method: "POST", body: form });

  assert.equal(body.updated, 1);
  const contact = await prisma.contact.findFirst({ where: { name: "Leo" } });
  assert.equal(contact.yearKnown, true);
  assert.equal(contact.birthdate.toISOString().slice(0, 10), "1998-06-30");
});

/* ---------------------------- subscriptions ---------------------------- */

const subscription = (endpoint) => ({
  endpoint,
  keys: { p256dh: "BNcRd".padEnd(87, "x"), auth: "abcdefghijklmnop" },
});

dbTest("re-subscribing the same browser updates its row instead of adding a device", async () => {
  const endpoint = "https://fcm.googleapis.com/fcm/send/abc123";
  assert.equal((await call("/api/subscriptions", { method: "POST", body: JSON.stringify({ subscription: subscription(endpoint) }) })).status, 201);
  assert.equal((await call("/api/subscriptions", { method: "POST", body: JSON.stringify({ subscription: subscription(endpoint) }) })).status, 201);

  const { body } = await call("/api/subscriptions");
  assert.equal(body.count, 1, "a duplicate row would mean duplicate notifications on one device");
});

dbTest("a malformed subscription is rejected", async () => {
  const { status } = await call("/api/subscriptions", {
    method: "POST",
    body: JSON.stringify({ subscription: { endpoint: "https://x", keys: {} } }),
  });
  assert.equal(status, 400);
});

dbTest("unsubscribing removes the device", async () => {
  const endpoint = "https://fcm.googleapis.com/fcm/send/gone";
  await call("/api/subscriptions", { method: "POST", body: JSON.stringify({ subscription: subscription(endpoint) }) });
  assert.equal((await call("/api/subscriptions/unsubscribe", { method: "POST", body: JSON.stringify({ endpoint }) })).status, 204);
  assert.equal((await call("/api/subscriptions")).body.count, 0);
});

/* ----------------------------- the daily job ---------------------------- */

dbTest("the job finds exactly today's birthdays and records the run", async () => {
  for (const [name, offset] of [["Birthday Today", 0], ["Also Today", 0], ["Tomorrow", 1]]) {
    await call("/api/contacts", {
      method: "POST",
      body: JSON.stringify({ name, birthdate: birthdayInDays(offset, 1996) }),
    });
  }

  const result = await runBirthdayJob({ trigger: "test" });
  assert.equal(result.status, "ran");
  assert.equal(result.birthdayCount, 2);
  assert.deepEqual(result.birthdays.map((b) => b.name).sort(), ["Also Today", "Birthday Today"]);

  const run = await prisma.notificationRun.findUnique({ where: { runDate: dayKey(today()) } });
  assert.ok(run, "the day must be recorded");
  assert.equal(run.birthdayCount, 2);
});

dbTest("running the job twice in a day does not notify twice", async () => {
  await call("/api/contacts", { method: "POST", body: JSON.stringify({ name: "Ava", birthdate: birthdayInDays(0, 1990) }) });

  assert.equal((await runBirthdayJob({ trigger: "test" })).status, "ran");
  assert.equal((await runBirthdayJob({ trigger: "catch-up" })).status, "already-ran");
  assert.equal(await prisma.notificationRun.count(), 1);
});

dbTest("a day with no birthdays is still claimed, so boot catch-up stays cheap", async () => {
  const result = await runBirthdayJob({ trigger: "test" });
  assert.equal(result.birthdayCount, 0);
  assert.equal(await prisma.notificationRun.count(), 1);
});

dbTest("POST /api/runs/today is idempotent, and ?force=1 bypasses the guard", async () => {
  await call("/api/contacts", { method: "POST", body: JSON.stringify({ name: "Ava", birthdate: birthdayInDays(0, 1990) }) });

  assert.equal((await call("/api/runs/today", { method: "POST" })).body.status, "ran");
  assert.equal((await call("/api/runs/today", { method: "POST" })).body.status, "already-ran");

  const forced = await call("/api/runs/today?force=1", { method: "POST" });
  assert.equal(forced.body.status, "ran");
  assert.equal(await prisma.notificationRun.count(), 1, "a forced run must not add a second day row");
});

dbTest("the notification names the person and the age they are turning", async () => {
  const { birthdayNotification } = await import("../server/lib/push.js");

  const one = birthdayNotification([{ id: "a", name: "Ava Bennett", turningAge: 27 }], { year: 2026 });
  assert.equal(one.body, "It's Ava Bennett's birthday today! They are turning 27.");

  const noAge = birthdayNotification([{ id: "b", name: "Leo", turningAge: null }], { year: 2026 });
  assert.equal(noAge.body, "It's Leo's birthday today!");
  assert.doesNotMatch(noAge.body, /null|undefined|NaN/);

  const many = birthdayNotification(
    [{ id: "a", name: "Ava", turningAge: 27 }, { id: "b", name: "Leo", turningAge: null }],
    { year: 2026 },
  );
  assert.equal(many.title, "2 birthdays today");
  assert.equal(many.body, "Ava (27), Leo");
});

dbTest("a dead push endpoint is deleted rather than retried forever", async () => {
  const { sendToAll } = await import("../server/lib/push.js");
  // A syntactically valid but unroutable endpoint: web-push rejects it, and the
  // row must not survive to fail again every morning.
  await prisma.subscription.create({
    data: {
      endpoint: "https://updates.push.services.mozilla.com/wpush/v2/deadbeef",
      p256dh: "BNcRd".padEnd(87, "x"),
      auth: "abcdefghijklmnop",
      failureCount: 4,
    },
  });

  const result = await sendToAll({ title: "t", body: "b" });
  assert.equal(result.sent, 0);
  assert.equal(result.failed, 1);
  assert.equal(await prisma.subscription.count(), 0, "the fifth failure prunes the row");
});

/* ------------------------------ SPA + 404s ----------------------------- */

dbTest("an unknown API route is a JSON 404, not the SPA shell", async () => {
  const { status, body } = await call("/api/nope");
  assert.equal(status, 404);
  assert.match(body.error, /No API route/);
});
