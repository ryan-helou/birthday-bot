import { defineRailway, github, postgres, preserve, project, service, volume } from "railway/iac";

/**
 * Railway infrastructure for Birthday Bot.
 *
 * Replaces the deprecated railway.json (Config as Code), which stops being read
 * on 2026-12-01. Secrets are `preserve()`d — they live in Railway's variables,
 * never in this repo.
 */
export default defineRailway(() => {
  const Postgres = postgres("Postgres", { region: "us-west2" });
  Postgres.networking = { privateNetworkEndpoint: "postgres" };

  const postgresVolume = volume("postgres-volume", {
    alerts: { usage: { "80": {}, "95": {}, "100": {} } },
    allowOnlineResize: true,
    region: "us-west2",
    sizeMB: 5000,
  });

  const birthdayBot = service("birthday-bot", {
    source: github("ryan-helou/birthday-bot", { checkSuites: false }),
    replicas: { "us-west2": 1 },

    // `npm run build` runs prisma generate + the Vite build + the service-worker
    // stamp; `npm run start` applies migrations before booting the server.
    build: "npm run build",
    start: "npm run start",

    // The health check reports 503 while Postgres is unreachable, so a container
    // that cannot reach the database never takes traffic.
    healthcheck: "/api/health",
    healthcheckTimeout: 120,

    env: {
      APP_TIMEZONE: preserve(),
      DATABASE_URL: preserve(),
      NODE_ENV: preserve(),
      NOTIFY_HOUR: preserve(),
      TZ: preserve(),
      VAPID_PRIVATE_KEY: preserve(),
      VAPID_PUBLIC_KEY: preserve(),
      VAPID_SUBJECT: preserve(),
    },
  });

  return project("birthday-bot", {
    resources: [Postgres, birthdayBot, postgresVolume],
  });
});
