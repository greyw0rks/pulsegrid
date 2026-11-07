import { readFile, writeFile, mkdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { parse } from "dotenv";
import { privateKeyToAccount } from "viem/accounts";

const source = parse(await readFile(".local/worker.env"));
const reporter = privateKeyToAccount(source.PULSEGRID_PRIVATE_KEY);
if (source.PULSEGRID_NETWORK !== "bot-mainnet" || reporter.address.toLowerCase() !== "0xe79bb36b53835f0740bd4a9684f5c84d8fb9b52c" ||
    source.PULSEGRID_REGISTRY_ADDRESS?.toLowerCase() !== "0x368d564dd8166d1967f21c7fbaaf87883ef85c83" || source.PULSEGRID_DB_SCHEMA !== "pulsegrid_bot_677") {
  throw new Error("Local BOT reporter configuration does not match the deployment");
}
const variables = Object.fromEntries(["DATABASE_URL", "PULSEGRID_NETWORK", "PULSEGRID_DB_SCHEMA", "PULSEGRID_EVM_RPC", "PULSEGRID_REGISTRY_ADDRESS", "PULSEGRID_DEPLOYMENT_BLOCK", "PULSEGRID_PRIVATE_KEY"].map(key => [key, source[key]]));
variables.PULSEGRID_REPORTING_ENABLED = "true";
variables.PULSEGRID_REPORT_MAX_COST = "0.05";
variables.PULSEGRID_REPORT_DAILY_MAX_COST = "0.25";
if (Object.values(variables).some(value => !value)) throw new Error("Required reporter configuration is missing");
await mkdir("scheduler/.local", { recursive: true, mode: 0o700 });
const file = resolve("scheduler/.local/reporter.env");
await writeFile(file, Object.entries(variables).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join("\n") + "\n", { mode: 0o600 });
if (process.argv.includes("--apply")) {
  const cli = resolve("scheduler/node_modules/convex/bin/main.js");
  await new Promise((done, reject) => {
    const child = spawn(process.execPath, [cli, "env", "set", "--from-file", file, "--force", "--deployment", "sincere-hamster-832"], { cwd: resolve("scheduler"), stdio: ["ignore", "pipe", "pipe"] });
    // Do not forward the CLI's environment output: it may include configured values.
    child.stdout.resume();
    child.stderr.resume();
    child.on("error", () => reject(new Error("Convex environment command could not start")));
    child.on("exit", code => code === 0 ? done() : reject(new Error(`Convex environment update failed (exit ${code})`)));
  });
}
console.log(JSON.stringify({ event: "convex_reporter_configured", applied: process.argv.includes("--apply"), deployment: "sincere-hamster-832", reporter: reporter.address, perTransactionBOT: "0.05", per24HoursBOT: "0.25", keyIncludedInWebsite: false }));
