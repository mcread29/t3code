#!/usr/bin/env node

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const builtServerEntry = path.join(repoRoot, "apps/server/dist/index.mjs");
const builtClientEntry = path.join(repoRoot, "apps/server/dist/client/index.html");
const forwardedArgs = process.argv.slice(2);

const missingPaths = [builtServerEntry, builtClientEntry].filter((entry) => !existsSync(entry));

if (missingPaths.length > 0) {
  console.error("[run-built-app-server] Missing required build output:");
  for (const missingPath of missingPaths) {
    console.error(`- ${path.relative(repoRoot, missingPath)}`);
  }
  console.error(
    "[run-built-app-server] Run `bun run --cwd apps/web build` and `bun run --cwd apps/server build` first.",
  );
  process.exit(1);
}

const child = spawn(process.execPath, [builtServerEntry, ...forwardedArgs], {
  cwd: repoRoot,
  env: process.env,
  stdio: "inherit",
});

for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
  process.on(signal, () => {
    if (!child.killed) {
      child.kill(signal);
    }
  });
}

child.on("error", (error) => {
  console.error("[run-built-app-server] Failed to start built server.", error);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
