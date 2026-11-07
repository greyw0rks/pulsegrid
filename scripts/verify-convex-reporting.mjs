import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const child = spawn(process.execPath, [resolve("scheduler/node_modules/convex/bin/main.js"), "logs", "--deployment", "sincere-hamster-832", "--history", "250", "--success", "--jsonl"], { cwd: resolve("scheduler"), stdio: ["ignore", "pipe", "pipe"] });
let buffer = "";
const completions = new Map();
let finished = false;
const deadline = setTimeout(() => { child.kill("SIGTERM"); console.error("No complete automatic reporting invocation found before timeout"); process.exitCode = 1; }, 180000);
child.stderr.resume();
child.on("error", () => { clearTimeout(deadline); console.error("Convex log verification could not start"); process.exitCode = 1; });
child.stdout.on("data", async chunk => {
  buffer += chunk.toString();
  const lines = buffer.split("\n");
  buffer = lines.pop();
  for (const line of lines) {
    if (!line.startsWith("{")) continue;
    let event;
    try { event = JSON.parse(line); } catch { continue; }
    if (event.kind !== "Completion" || event.error !== null || event.timestamp < Date.parse("2026-11-07T16:42:00Z") / 1000) continue;
    completions.set(event.executionId, event);
  }
  if (finished) return;
  const cron = [...completions.values()].find(event => event.identifier === "monitor:run" && event.caller === "Cron" && [...completions.values()].some(report => report.identifier === "reporter:run" && report.parentExecutionId === event.executionId));
  if (!cron) return;
  const reporter = [...completions.values()].find(event => event.identifier === "reporter:run" && event.parentExecutionId === cron.executionId);
  finished = true;
  clearTimeout(deadline);
  child.kill("SIGTERM");
  const retain = event => ({ identifier: event.identifier, caller: event.caller, executionId: event.executionId, parentExecutionId: event.parentExecutionId, startedAt: new Date(event.executionTimestamp * 1000).toISOString(), finishedAt: new Date(event.timestamp * 1000).toISOString(), error: event.error, willRetry: event.willRetry });
  const record = { checkedAt: new Date().toISOString(), deployment: "sincere-hamster-832", environment: "production", intervalMinutes: 5, signingBackend: "Private Convex Node action", websiteHasSigner: false, maximumFeeBOT: "0.05", rolling24HourReservedFeesBOT: "0.25", automaticMonitoring: retain(cron), automaticReporting: retain(reporter) };
  await writeFile("docs/evidence/convex-reporting.json", JSON.stringify(record, null, 2) + "\n");
  console.log(JSON.stringify(record));
});
child.on("exit", code => { if (!finished) { clearTimeout(deadline); console.error(`Convex log verification ended without a matched cron/reporting invocation (exit ${code})`); process.exitCode = 1; } });
