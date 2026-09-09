/**
 * Stamps a build id into the built service worker.
 *
 * The id is a hash of the BUILT APP (every file in client/dist except sw.js),
 * not of sw.js itself. Hashing the worker would mean the id never changes when
 * you ship a feature, so no browser ever sees changed /sw.js bytes, no new
 * worker installs, and installed clients serve a stale shell — with the old
 * HTML pointing at chunk hashes the server no longer has.
 *
 * Content-addressed, so an identical rebuild keeps the same id and does not
 * churn workers for no reason.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "client", "dist");
const swPath = join(dist, "sw.js");

function walk(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const files = walk(dist)
  .filter((file) => file !== swPath)
  .sort();

if (files.length === 0) {
  console.error("stamp-sw: client/dist is empty — run the client build first.");
  process.exit(1);
}

const hash = createHash("sha256");
for (const file of files) {
  hash.update(relative(dist, file));
  hash.update(readFileSync(file));
}
const buildId = hash.digest("hex").slice(0, 12);

const source = readFileSync(swPath, "utf8");
if (!source.includes("__BUILD_ID__")) {
  console.error("stamp-sw: no __BUILD_ID__ placeholder in the built sw.js.");
  process.exit(1);
}

writeFileSync(swPath, source.replace(/__BUILD_ID__/g, buildId));
console.log(`stamp-sw: build id ${buildId} (hashed ${files.length} app files)`);
