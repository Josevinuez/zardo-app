#!/usr/bin/env node

/**
 * Shopify CLI still invokes `npm exec remix vite:dev` even after migrating away from Remix.
 * We shim that command to boot our Express + Vite dev stack instead.
 */

import { spawn } from "node:child_process";

function runDevServer() {
  const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
  const child = spawn(npmCmd, ["run", "dev"], {
    stdio: "inherit",
    env: {
      ...process.env,
      SHOPIFY_REMIX_SHIM: "1",
    },
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });
}

function main() {
  const [, , subcommand, ...rest] = process.argv;

  if (subcommand === "vite:dev") {
    // Hand off to our combined Express + Vite dev runner.
    runDevServer();
    return;
  }

  console.error(
    `remix-shim: Unsupported command "${[subcommand, ...rest]
      .filter(Boolean)
      .join(" ")}".`,
  );
  console.error("This project no longer uses Remix. Run `npm run dev` directly instead.");
  process.exit(1);
}

main();
