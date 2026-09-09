/**
 * Runs the Express API and the Vite dev server together, with prefixed output.
 * Vite proxies /api to the API, so the app behaves like the single-origin
 * production deployment.
 */
import { spawn } from "node:child_process";

const targets = [
  { name: "api  ", command: process.execPath, args: ["--watch", "server/index.js"], colour: "\x1b[36m" },
  { name: "web  ", command: "npx", args: ["vite", "--config", "client/vite.config.js"], colour: "\x1b[35m" },
];

const children = targets.map(({ name, command, args, colour }) => {
  const child = spawn(command, args, { stdio: ["inherit", "pipe", "pipe"], env: process.env });
  const write = (stream) => (chunk) => {
    for (const line of chunk.toString().split("\n")) {
      if (line.trim()) stream.write(`${colour}${name}\x1b[0m ${line}\n`);
    }
  };
  child.stdout.on("data", write(process.stdout));
  child.stderr.on("data", write(process.stderr));
  child.on("exit", (code) => {
    if (code !== 0 && code !== null) {
      console.error(`${name.trim()} exited with ${code}`);
      shutdown();
    }
  });
  return child;
});

function shutdown() {
  for (const child of children) child.kill("SIGTERM");
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
