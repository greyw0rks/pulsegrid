import { spawn } from "node:child_process";
import { existsSync, mkdirSync, openSync, closeSync, writeFileSync, readFileSync, readlinkSync } from "node:fs";
import { resolve } from "node:path";
import { runtimeConfig } from "../src/lib/env";

const config = runtimeConfig();
const site = new URL(config.siteUrl);
if (!["localhost", "127.0.0.1"].includes(site.hostname)) throw new Error("local:up requires a local PULSEGRID_SITE_URL");
const port = site.port || "3000";
const dev = process.argv.includes("--dev");
if (!dev && !existsSync(".next/BUILD_ID")) throw new Error("Run pnpm build first, or pnpm local:up --dev");
mkdirSync(".local/runtime", { recursive: true });
function running(name: string) {
  try {
    const pid = Number(readFileSync(`.local/runtime/${name}.pid`, "utf8").trim());
    return pid > 0 && readlinkSync(`/proc/${pid}/cwd`) === process.cwd() && !!readFileSync(`/proc/${pid}/cmdline`, "utf8").trim();
  } catch { return false; }
}
function start(name: string, args: string[]) {
  const fd = openSync(`.local/runtime/${name}.log`, "a");
  const child = spawn(process.execPath, args, { cwd: process.cwd(), detached: true, stdio: ["ignore", fd, fd] });
  closeSync(fd); child.unref();
  writeFileSync(`.local/runtime/${name}.pid`, String(child.pid));
  console.log(`${name} started (${child.pid}); logs: .local/runtime/${name}.log`);
}
if (running("worker")) console.log("Pulsegrid worker is already running.");
else start("worker", ["--import", "tsx", resolve("worker/main.ts")]);
if (running("web")) console.log("Pulsegrid web process is already running.");
else {
  let occupied = false;
  try { await fetch(`${site.origin}/api/health`, { signal: AbortSignal.timeout(1000) }); occupied = true; } catch { /* Start below. */ }
  if (occupied) throw new Error(`Port ${port} is already serving HTTP; inspect it before starting Pulsegrid`);
  start("web", [resolve("node_modules/next/dist/bin/next"), dev ? "dev" : "start", "--hostname", "127.0.0.1", "--port", port]);
}
console.log(`Pulsegrid preview: ${site.origin}. Check /api/health after startup.`);
