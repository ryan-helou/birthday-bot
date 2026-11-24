import crypto from "node:crypto";
import { currentPasscode, env } from "./env.js";

/**
 * Optional passcode gate.
 *
 * OFF unless APP_PASSCODE is set, so an existing deployment keeps working
 * exactly as before. Set the variable and the whole app — API and page — is
 * behind one passcode, entered once per device.
 *
 * The cookie is an HMAC of its own expiry under a key derived from the
 * passcode, so there is no session store to keep and changing the passcode
 * invalidates every device at once.
 */
const COOKIE = "bb_session";
const MAX_AGE_DAYS = 180;

const key = () =>
  crypto.createHash("sha256").update(`birthday-bot:${currentPasscode()}`).digest();

function sign(expiresAt) {
  const mac = crypto.createHmac("sha256", key()).update(String(expiresAt)).digest("base64url");
  return `${expiresAt}.${mac}`;
}

function verify(token) {
  if (typeof token !== "string") return false;
  const [expiresRaw, mac] = token.split(".");
  const expiresAt = Number(expiresRaw);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return false;
  const expected = crypto.createHmac("sha256", key()).update(expiresRaw).digest("base64url");
  const a = Buffer.from(mac ?? "", "utf8");
  const b = Buffer.from(expected, "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function readCookie(req) {
  const raw = req.headers.cookie;
  if (!raw) return undefined;
  for (const part of raw.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === COOKIE) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}

/** Public routes: the health check, and the passcode exchange itself. */
const OPEN = new Set(["/api/health", "/api/session"]);

/*
 * Rate limit on guessing.
 *
 * The lock sits on a public URL, so without this a passcode is only as strong
 * as how fast someone can POST. Ten wrong answers per address per 15 minutes
 * turns even a short passcode into something not worth attacking. In memory on
 * purpose: one process, and a restart clearing the counters is not a weakness
 * worth a table for.
 */
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;

/** Per-app counters. Owned by the instance, not the module, so two apps in one
 *  process (which is what the tests do) cannot lock each other out. */
function createLimiter() {
  const attempts = new Map(); // ip -> { count, resetAt }

  return {
    blocked(ip) {
      const seen = attempts.get(ip);
      return Boolean(seen) && Date.now() <= seen.resetAt && seen.count >= MAX_ATTEMPTS;
    },
    fail(ip) {
      const now = Date.now();
      const seen = attempts.get(ip);
      if (!seen || now > seen.resetAt) attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
      else seen.count += 1;

      // Keep the map from growing without bound on a long-lived process.
      if (attempts.size > 5000) {
        for (const [key, value] of attempts) if (now > value.resetAt) attempts.delete(key);
      }
    },
    clear: (ip) => attempts.delete(ip),
  };
}

export function passcodeGate(req, res, next) {
  if (!currentPasscode()) return next();
  if (OPEN.has(req.path)) return next();
  if (verify(readCookie(req))) return next();

  if (req.path.startsWith("/api/")) {
    return res.status(401).json({ error: "This Birthday Bot is locked. Enter the passcode." });
  }
  // Let the page load; the client asks for a passcode when the API says 401.
  return next();
}

export function sessionRoutes(app) {
  const limiter = createLimiter();

  app.get("/api/session", (req, res) => {
    const passcode = currentPasscode();
    res.json({ required: Boolean(passcode), signedIn: !passcode || verify(readCookie(req)) });
  });

  app.post("/api/session", (req, res) => {
    const passcode = currentPasscode();
    if (!passcode) return res.json({ signedIn: true });

    const ip = req.ip ?? "unknown";
    if (limiter.blocked(ip)) {
      return res.status(429).json({ error: "Too many tries. Wait 15 minutes and try again." });
    }

    const given = String(req.body?.passcode ?? "");
    const a = Buffer.from(given, "utf8");
    const b = Buffer.from(passcode, "utf8");
    const ok = a.length === b.length && crypto.timingSafeEqual(a, b);
    if (!ok) {
      limiter.fail(ip);
      return res.status(401).json({ error: "That passcode doesn't match." });
    }
    limiter.clear(ip);

    const expiresAt = Date.now() + MAX_AGE_DAYS * 86400_000;
    res.setHeader(
      "Set-Cookie",
      `${COOKIE}=${encodeURIComponent(sign(expiresAt))}; Path=/; HttpOnly; SameSite=Lax; ` +
        `Max-Age=${MAX_AGE_DAYS * 86400}${env.isProduction ? "; Secure" : ""}`,
    );
    res.json({ signedIn: true });
  });

  app.delete("/api/session", (req, res) => {
    res.setHeader("Set-Cookie", `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
    res.status(204).end();
  });
}
