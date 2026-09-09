import "dotenv/config";

function optional(name, fallback = "") {
  const value = process.env[name];
  return value == null || value === "" ? fallback : value;
}

function intInRange(name, fallback, min, max) {
  const raw = process.env[name];
  const value = raw == null || raw === "" ? fallback : Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max} (got ${raw})`);
  }
  return value;
}

const databaseUrl = optional("DATABASE_URL");
if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL is not set. Copy .env.example to .env for local development, " +
      "or on Railway set DATABASE_URL = ${{ Postgres.DATABASE_URL }} on the app service.",
  );
}

const timeZone = optional("APP_TIMEZONE", "America/Toronto");
try {
  new Intl.DateTimeFormat("en-CA", { timeZone });
} catch {
  throw new Error(`APP_TIMEZONE "${timeZone}" is not a valid IANA timezone.`);
}

export const env = {
  nodeEnv: optional("NODE_ENV", "development"),
  isProduction: optional("NODE_ENV", "development") === "production",
  // Railway injects PORT and its health check depends on us binding it.
  port: intInRange("PORT", 8080, 1, 65535),
  databaseUrl,
  timeZone,
  notifyHour: intInRange("NOTIFY_HOUR", 8, 0, 23),
  vapid: {
    publicKey: optional("VAPID_PUBLIC_KEY"),
    privateKey: optional("VAPID_PRIVATE_KEY"),
    subject: optional("VAPID_SUBJECT", "mailto:admin@example.com"),
  },
};

/** Whether both VAPID variables are present. Whether they are USABLE is decided
 *  in server/lib/push.js, which validates them without letting a bad pair crash
 *  the process — import `pushConfigured` from there, not from here. */
export const vapidKeysPresent = Boolean(env.vapid.publicKey && env.vapid.privateKey);
