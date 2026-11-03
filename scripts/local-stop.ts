import { readFileSync, readlinkSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

for (const name of ["web", "worker"]) {
  let pid: number;
  try { pid = Number(readFileSync(`.local/runtime/${name}.pid`, "utf8")); if (readlinkSync(`/proc/${pid}/cwd`) !== process.cwd()) throw new Error("Process ownership mismatch"); }
  catch { console.log(`No owned ${name} process is running.`); continue; }
  process.kill(pid, "SIGTERM");
  let stopped = false;
  for (let i = 0; i < 150; i++) {
    try { process.kill(pid, 0); } catch { stopped = true; break; }
    await sleep(100);
  }
  console.log(`${name} ${stopped ? "stopped" : "is still shutting down; check its log"} (${pid}).`);
}
console.log("Database and evidence were preserved.");
