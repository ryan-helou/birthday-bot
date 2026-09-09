import path from "node:path";
import fs from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import express from "express";
import cors from "cors";

import { env } from "./env.js";
import { prisma } from "./prisma.js";
import { contactsRouter } from "./routes/contacts.js";
import { subscriptionsRouter } from "./routes/subscriptions.js";
import { importRouter } from "./routes/import.js";
import { systemRouter } from "./routes/system.js";
import { passcodeGate, sessionRoutes } from "./auth.js";
import { scheduleBirthdayJob } from "./jobs/birthday-job.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(__dirname, "../client/dist");

export function createApp() {
  const app = express();

  app.set("trust proxy", 1); // Railway terminates TLS in front of us.
  app.use(express.json({ limit: "5mb" }));
  app.use(express.urlencoded({ extended: true }));

  // The PWA is served from this same origin in production, so CORS only matters
  // for the Vite dev server on :5173.
  if (!env.isProduction) app.use(cors());

  sessionRoutes(app);
  app.use(passcodeGate);

  app.use("/api", systemRouter);
  app.use("/api/contacts", contactsRouter);
  app.use("/api/subscriptions", subscriptionsRouter);
  app.use("/api/import", importRouter);

  app.use("/api", (req, res) => res.status(404).json({ error: `No API route ${req.method} ${req.originalUrl}` }));

  if (fs.existsSync(clientDist)) {
    // index.html and the service worker must never be cached by the CDN/browser,
    // or an installed client keeps booting an old shell. Hashed assets are
    // immutable and can be cached hard.
    app.use(
      express.static(clientDist, {
        index: false,
        setHeaders(res, filePath) {
          const file = path.basename(filePath);
          if (file === "sw.js" || file === "index.html" || file === "manifest.webmanifest") {
            res.setHeader("Cache-Control", "no-cache, must-revalidate");
          } else if (filePath.includes(`${path.sep}assets${path.sep}`)) {
            res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
          }
        },
      }),
    );

    // SPA fallback. Express 5 uses path-to-regexp v8, where a bare "*" is no
    // longer a valid path — the middleware form below is the portable one.
    app.use((req, res, next) => {
      if (req.method !== "GET" && req.method !== "HEAD") return next();
      res.setHeader("Cache-Control", "no-cache, must-revalidate");
      res.sendFile(path.join(clientDist, "index.html"));
    });
  } else {
    app.get("/", (req, res) =>
      res
        .status(503)
        .type("text/plain")
        .send("Client bundle not built. Run `npm run build` (or `npm run dev` for the Vite server)."),
    );
  }

  // eslint-disable-next-line no-unused-vars
  app.use((error, req, res, next) => {
    console.error("[api]", error);
    res.status(500).json({ error: error?.message ?? "Internal server error" });
  });

  return app;
}

async function main() {
  const app = createApp();

  // Bind PORT before anything slow, so Railway's health check has a listener.
  const server = app.listen(env.port, () => {
    console.log(`[server] listening on :${env.port} (${env.nodeEnv})`);
    console.log(`[server] app timezone ${env.timeZone}; reminders at ${env.notifyHour}:00`);
  });

  scheduleBirthdayJob();

  const shutdown = async (signal) => {
    console.log(`[server] ${signal} received, shutting down`);
    server.close();
    await prisma.$disconnect().catch(() => {});
    process.exit(0);
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

// Only auto-start when run directly, so tests can import createApp().
// pathToFileURL, not a `file://` template: import.meta.url percent-encodes the
// path, so any directory with a space in it (this one) would never match and the
// process would exit 0 having started nothing.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error("[server] failed to start:", error);
    process.exit(1);
  });
}
