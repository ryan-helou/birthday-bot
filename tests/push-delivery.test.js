/**
 * Proves the real Web Push path end to end, without a browser or a push service.
 *
 * A local HTTP server stands in for the push service. We register a subscription
 * with a genuine P-256 keypair, run the daily job, capture the request the server
 * actually sent, and DECRYPT it (RFC 8291 / aes128gcm) to check the exact words
 * a phone would show. Then the built service worker is loaded in a sandbox and
 * handed that payload, so the push -> notification leg is covered too.
 */
import test from "node:test";
import assert from "node:assert/strict";
import https from "node:https";
import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import vm from "node:vm";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://localhost:5432/birthday_bot_test";
process.env.APP_TIMEZONE = "America/Toronto";
process.env.NODE_ENV = "test";

const vapid = (await import("web-push")).default.generateVAPIDKeys();
process.env.VAPID_PUBLIC_KEY = vapid.publicKey;
process.env.VAPID_PRIVATE_KEY = vapid.privateKey;
process.env.VAPID_SUBJECT = "mailto:test@example.com";

const { prisma } = await import("../server/prisma.js");
const { runBirthdayJob } = await import("../server/jobs/birthday-job.js");
const { civilToday, contactFieldsFromInput } = await import("../server/lib/dates.js");

let reachable = true;
try {
  await prisma.$queryRaw`SELECT 1`;
} catch (error) {
  reachable = false;
  console.error(`\n[push-delivery.test] skipping: ${error.message}\n`);
}

const b64url = (buffer) => Buffer.from(buffer).toString("base64url");
const fromB64url = (value) => Buffer.from(value, "base64url");

/* ------------------------- RFC 8291 decryption ------------------------- */

const hmac = (key, data) => crypto.createHmac("sha256", key).update(data).digest();
const hkdf = (salt, ikm, info, length) =>
  hmac(hmac(salt, ikm), Buffer.concat([info, Buffer.from([1])])).subarray(0, length);

/** Decrypt an aes128gcm Web Push body using the subscriber's private key. */
function decryptPush(body, { privateKey, publicKey, authSecret }) {
  const salt = body.subarray(0, 16);
  const idLength = body.readUInt8(20);
  const serverPublicKey = body.subarray(21, 21 + idLength);
  const ciphertext = body.subarray(21 + idLength);

  const sharedSecret = crypto.diffieHellman({
    privateKey,
    publicKey: crypto.createPublicKey({
      key: Buffer.concat([
        // SPKI prefix for an uncompressed prime256v1 point.
        Buffer.from("3059301306072a8648ce3d020106082a8648ce3d030107034200", "hex"),
        serverPublicKey,
      ]),
      format: "der",
      type: "spki",
    }),
  });

  const ikm = hkdf(
    authSecret,
    sharedSecret,
    Buffer.concat([Buffer.from("WebPush: info\0"), publicKey, serverPublicKey]),
    32,
  );
  const cek = hkdf(salt, ikm, Buffer.from("Content-Encoding: aes128gcm\0"), 16);
  const nonce = hkdf(salt, ikm, Buffer.from("Content-Encoding: nonce\0"), 12);

  const decipher = crypto.createDecipheriv("aes-128-gcm", cek, nonce);
  decipher.setAuthTag(ciphertext.subarray(ciphertext.length - 16));
  const plaintext = Buffer.concat([
    decipher.update(ciphertext.subarray(0, ciphertext.length - 16)),
    decipher.final(),
  ]);

  // Strip the RFC 8188 padding delimiter (0x02 on the final record).
  let end = plaintext.length;
  while (end > 0 && plaintext[end - 1] === 0) end -= 1;
  return plaintext.subarray(0, end - 1).toString("utf8");
}

/* ----------------------------- the fixture ----------------------------- */

function makeSubscriberKeys() {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const raw = publicKey.export({ format: "der", type: "spki" }).subarray(-65);
  return { privateKey, publicKey: raw, authSecret: crypto.randomBytes(16) };
}

const dbTest = (name, fn) => test(name, { skip: reachable ? false : "no test database" }, fn);

/**
 * Stands in for the push service by intercepting https.request. web-push always
 * speaks HTTPS, so a plain local server cannot be used — and intercepting here
 * still exercises everything that matters: VAPID signing and RFC 8291 payload
 * encryption both happen before the request is issued.
 */
function interceptPushService({ statusCode = 201 } = {}) {
  const captured = [];
  const original = https.request;

  https.request = (options, callback) => {
    const chunks = [];
    const request = new EventEmitter();
    request.write = (chunk) => { if (chunk) chunks.push(Buffer.from(chunk)); return true; };
    request.setTimeout = () => request;
    request.end = (chunk) => {
      if (chunk) chunks.push(Buffer.from(chunk));
      captured.push({
        hostname: options.hostname,
        port: options.port,
        path: options.path,
        method: options.method,
        headers: options.headers,
        body: Buffer.concat(chunks),
      });
      const response = Readable.from([]);
      response.statusCode = statusCode;
      response.headers = {};
      setImmediate(() => callback(response));
    };
    return request;
  };

  return { captured, restore: () => { https.request = original; } };
}

dbTest("the 8am job delivers a correctly signed, correctly encrypted notification", async () => {
  await prisma.notificationRun.deleteMany();
  await prisma.subscription.deleteMany();
  await prisma.contact.deleteMany();

  const keys = makeSubscriberKeys();
  await prisma.subscription.create({
    data: {
      endpoint: "https://updates.push.services.mozilla.com/wpush/v2/device-1",
      p256dh: b64url(keys.publicKey),
      auth: b64url(keys.authSecret),
      label: "Test device",
    },
  });

  // Someone with a birthday today, and someone without.
  const today = civilToday("America/Toronto");
  const birthYear = today.year - 30;
  await prisma.contact.create({
    data: contactFieldsFromInput({
      name: "Ava Bennett",
      birthdate: `${birthYear}-${String(today.month).padStart(2, "0")}-${String(today.day).padStart(2, "0")}`,
    }).fields,
  });
  await prisma.contact.create({
    data: contactFieldsFromInput({ name: "Nobody Today", birthdate: "1990-01-01" }).fields,
  });

  const push = interceptPushService();
  let result;
  try {
    result = await runBirthdayJob({ trigger: "test" });
  } finally {
    push.restore();
  }

  assert.equal(result.sentCount, 1, "exactly one device should have been notified");
  assert.equal(push.captured.length, 1, "the push service should have received one request");

  const [request] = push.captured;

  // VAPID: a signed JWT plus the server's public key, or the push service rejects it.
  assert.match(request.headers.Authorization ?? "", /^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=[\w-]+$/i);
  assert.equal(request.headers["Content-Encoding"], "aes128gcm");
  assert.equal(request.headers.TTL, 86400);
  assert.equal(request.hostname, "updates.push.services.mozilla.com");
  assert.ok(request.body.length > 100, "an encrypted payload should have been sent");
  assert.doesNotMatch(
    request.body.toString("latin1"),
    /Ava Bennett/,
    "the payload must be encrypted in transit",
  );

  const payload = JSON.parse(decryptPush(request.body, keys));
  assert.equal(payload.title, "Birthday today");
  assert.equal(payload.body, "It's Ava Bennett's birthday today! They are turning 30.");
  assert.match(payload.url, /^\/\?contact=/);

  // Hand the decrypted payload to the BUILT service worker and check what a
  // phone would actually be shown.
  const shown = runServiceWorkerPush(JSON.stringify(payload));
  assert.equal(shown.title, "Birthday today");
  assert.equal(shown.options.body, "It's Ava Bennett's birthday today! They are turning 30.");
  assert.equal(shown.options.icon, "/icons/icon-192.png");
  assert.equal(shown.options.badge, "/icons/badge-96.png");
  assert.equal(shown.options.data.url, payload.url);
});

dbTest("a push service that says the endpoint is gone drops the device", async () => {
  await prisma.notificationRun.deleteMany();
  await prisma.subscription.deleteMany();
  await prisma.contact.deleteMany();

  const keys = makeSubscriberKeys();
  await prisma.subscription.create({
    data: {
      endpoint: "https://updates.push.services.mozilla.com/wpush/v2/expired",
      p256dh: b64url(keys.publicKey),
      auth: b64url(keys.authSecret),
    },
  });
  const today = civilToday("America/Toronto");
  await prisma.contact.create({
    data: contactFieldsFromInput({
      name: "Ava",
      birthdate: `${today.year - 20}-${String(today.month).padStart(2, "0")}-${String(today.day).padStart(2, "0")}`,
    }).fields,
  });

  const push = interceptPushService({ statusCode: 410 });
  try {
    await runBirthdayJob({ trigger: "test" });
  } finally {
    push.restore();
  }

  assert.equal(await prisma.subscription.count(), 0, "a 410 must delete the subscription immediately");
});

/* --------------- the built service worker, in a sandbox --------------- */

/**
 * Loads client/dist/sw.js, fires a `push` event at it, and returns what it asked
 * the platform to display. Uses the BUILT file so the stamped build id and the
 * shipped bytes are what gets tested.
 */
function runServiceWorkerPush(payloadJson) {
  const source = readFileSync(resolve(root, "client/dist/sw.js"), "utf8");
  const listeners = {};
  let shown = null;

  const self = {
    addEventListener: (type, handler) => { listeners[type] = handler; },
    location: { origin: "https://example.test" },
    skipWaiting: () => {},
    clients: { claim: () => {}, matchAll: async () => [], openWindow: async () => {} },
    registration: {
      showNotification: (title, options) => { shown = { title, options }; return Promise.resolve(); },
    },
  };

  const context = {
    self,
    caches: { open: async () => ({ addAll: async () => {}, put: async () => {} }), keys: async () => [], match: async () => undefined, delete: async () => {} },
    fetch: async () => new Response(""),
    Response,
    URL,
    console,
    setTimeout,
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(source, context);

  assert.ok(listeners.push, "the worker must register a push listener");

  const waits = [];
  listeners.push({
    data: { json: () => JSON.parse(payloadJson), text: () => payloadJson },
    waitUntil: (promise) => waits.push(promise),
  });

  assert.ok(shown, "the worker must call showNotification");
  return shown;
}

test("the service worker falls back to plain text when the payload is not JSON", () => {
  const shown = runServiceWorkerPush("not json at all");
  assert.equal(shown.title, "Birthday Bot");
  assert.equal(shown.options.body, "not json at all");
});

test.after(async () => {
  await prisma.$disconnect().catch(() => {});
});
