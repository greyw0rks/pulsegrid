import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { spawnSync } from "node:child_process";
import { Pool } from "pg";
import "../src/lib/env";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("Run node scripts/local-config.mjs or configure DATABASE_URL first");
const url = new URL(databaseUrl);
if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.port !== "5434" || url.username !== "pulsegrid" || url.pathname !== "/pulsegrid") {
  throw new Error("Local setup only starts the dedicated pulsegrid database on localhost:5434; configure other databases separately");
}
const connection = new Pool({ connectionString: databaseUrl, max: 1, connectionTimeoutMillis: 1000 });
let available = false;
try { await connection.query("SELECT 1"); available = true; } catch { /* Start the owned local cluster below. */ }
await connection.end();
if (available) { console.log("Pulsegrid PostgreSQL is already available on port 5434."); process.exit(0); }

const bin = resolve(process.env.PULSEGRID_POSTGRES_BIN || ".local/tools/postgres/usr/lib/postgresql/17/bin");
const share = resolve(process.env.PULSEGRID_POSTGRES_SHARE || ".local/tools/postgres/usr/share/postgresql/17");
const libraries = resolve(process.env.PULSEGRID_POSTGRES_LIB || ".local/tools/postgres/usr/lib/x86_64-linux-gnu");
const subprocessEnv = { ...process.env, LD_LIBRARY_PATH: [libraries, process.env.LD_LIBRARY_PATH].filter(Boolean).join(":") };
if (!existsSync(join(bin, "initdb"))) throw new Error("PostgreSQL binaries are missing. Use docker compose up -d db, or set PULSEGRID_POSTGRES_BIN and PULSEGRID_POSTGRES_SHARE; see README.md");
const data = resolve(".local/postgres");
const socket = resolve(".local/postgres-socket");
mkdirSync(socket, { recursive: true, mode: 0o700 });
function run(command: string, args: string[]) {
  const result = spawnSync(join(bin, command), args, { stdio: "inherit", env: subprocessEnv });
  if (result.error || result.status !== 0) throw new Error(`PostgreSQL ${command} failed`);
}
if (!existsSync(join(data, "PG_VERSION"))) {
  const passwordFile = resolve(".local/postgres-password");
  writeFileSync(passwordFile, `${decodeURIComponent(url.password)}\n`, { mode: 0o600 });
  run("initdb", ["-D", data, "-L", share, "--username=pulsegrid", "--auth-local=trust", "--auth-host=scram-sha-256", `--pwfile=${passwordFile}`, "--encoding=UTF8", "--no-locale"]);
}
const status = spawnSync(join(bin, "pg_ctl"), ["-D", data, "status"], { stdio: "ignore", env: subprocessEnv });
if (status.status !== 0) run("pg_ctl", ["-D", data, "-l", resolve(".local/postgres.log"), "-o", `-h 127.0.0.1 -p 5434 -k ${socket}`, "-w", "-t", "20", "start"]);
const adminUrl = new URL(databaseUrl); adminUrl.pathname = "/postgres";
const admin = new Pool({ connectionString: adminUrl.toString(), max: 1, connectionTimeoutMillis: 3000 });
try {
  if (!(await admin.query("SELECT 1 FROM pg_database WHERE datname='pulsegrid'")).rowCount) await admin.query("CREATE DATABASE pulsegrid");
} finally { await admin.end(); }
console.log("Pulsegrid PostgreSQL is running on port 5434; persistent data is in .local/postgres.");
