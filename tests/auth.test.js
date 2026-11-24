/**
 * The passcode gate. It is OFF unless APP_PASSCODE is set, so the first thing
 * to prove is that an unset passcode changes nothing at all.
 */
import test from "node:test";
import assert from "node:assert/strict";

const BASE_ENV = {
  DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgresql://localhost:5432/birthday_bot_test",
  APP_TIMEZONE: "America/Toronto",
  NODE_ENV: "test",
};

/** Boot a fresh app in its own module registry so env is read from scratch. */
async function boot({ passcode } = {}) {
  for (const [k, v] of Object.entries(BASE_ENV)) process.env[k] = v;
  if (passcode) process.env.APP_PASSCODE = passcode;
  else delete process.env.APP_PASSCODE;

  const stamp = Date.now() + Math.random();
  const { createApp } = await import(`../server/index.js?t=${stamp}`);
  const server = createApp().listen(0);
  await new Promise((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  return {
    base,
    close: () => server.close(),
    call: (path, options = {}) =>
      fetch(`${base}${path}`, {
        headers: { "Content-Type": "application/json", ...(options.headers ?? {}) },
        ...options,
      }),
  };
}

let reachable = true;
try {
  process.env.DATABASE_URL = BASE_ENV.DATABASE_URL;
  const { prisma } = await import("../server/prisma.js");
  await prisma.$queryRaw`SELECT 1`;
} catch {
  reachable = false;
}
const dbTest = (name, fn) => test(name, { skip: reachable ? false : "no test database" }, fn);

dbTest("with no passcode set, nothing is gated", async () => {
  const app = await boot();
  try {
    assert.equal((await app.call("/api/contacts")).status, 200);
    const session = await (await app.call("/api/session")).json();
    assert.equal(session.required, false);
    assert.equal(session.signedIn, true);
  } finally { app.close(); }
});

dbTest("with a passcode set, the API is closed until you present it", async () => {
  const app = await boot({ passcode: "hunter2" });
  try {
    const blocked = await app.call("/api/contacts");
    assert.equal(blocked.status, 401);
    assert.match((await blocked.json()).error, /locked/i);

    // The health check stays open — Railway must still be able to probe it.
    assert.equal((await app.call("/api/health")).status, 200);

    const wrong = await app.call("/api/session", {
      method: "POST", body: JSON.stringify({ passcode: "nope" }),
    });
    assert.equal(wrong.status, 401);

    const right = await app.call("/api/session", {
      method: "POST", body: JSON.stringify({ passcode: "hunter2" }),
    });
    assert.equal(right.status, 200);

    const cookie = right.headers.get("set-cookie").split(";")[0];
    const allowed = await app.call("/api/contacts", { headers: { cookie } });
    assert.equal(allowed.status, 200, "the cookie should open the API");
  } finally { app.close(); }
});

dbTest("a forged or altered cookie is refused", async () => {
  const app = await boot({ passcode: "hunter2" });
  try {
    const future = Date.now() + 86400000;
    for (const bad of [`bb_session=${future}.deadbeef`, "bb_session=x.y", `bb_session=${future}.`]) {
      const res = await app.call("/api/contacts", { headers: { cookie: bad } });
      assert.equal(res.status, 401, `expected ${bad} to be refused`);
    }
  } finally { app.close(); }
});

dbTest("guessing is rate limited, so a public lock cannot be brute-forced", async () => {
  const app = await boot({ passcode: "hunter2" });
  try {
    let sawLimit = false;
    for (let i = 0; i < 12; i += 1) {
      const res = await app.call("/api/session", {
        method: "POST", body: JSON.stringify({ passcode: `wrong-${i}` }),
      });
      if (res.status === 429) { sawLimit = true; break; }
      assert.equal(res.status, 401, `attempt ${i} should be a plain rejection`);
    }
    assert.ok(sawLimit, "repeated wrong guesses must start returning 429");

    // The correct passcode is refused too while the window is open — otherwise
    // the limit would only slow down an attacker who guesses wrong forever.
    const blocked = await app.call("/api/session", {
      method: "POST", body: JSON.stringify({ passcode: "hunter2" }),
    });
    assert.equal(blocked.status, 429);
  } finally { app.close(); }
});

dbTest("a cookie minted under a different passcode stops working", async () => {
  const first = await boot({ passcode: "hunter2" });
  let cookie;
  try {
    const res = await first.call("/api/session", {
      method: "POST", body: JSON.stringify({ passcode: "hunter2" }),
    });
    cookie = res.headers.get("set-cookie").split(";")[0];
    assert.equal((await first.call("/api/contacts", { headers: { cookie } })).status, 200);
  } finally { first.close(); }

  const rotated = await boot({ passcode: "different" });
  try {
    const res = await rotated.call("/api/contacts", { headers: { cookie } });
    assert.equal(res.status, 401, "rotating the passcode must sign every device out");
  } finally { rotated.close(); }
});
