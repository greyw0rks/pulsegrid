import { setTimeout as sleep } from "node:timers/promises";
import { pool } from "../src/lib/db";
import { runtimeConfig } from "../src/lib/env";
import { ledgerTick } from "../src/lib/ledger";
import { probeEndpoint } from "../src/lib/probe";
import { dueEndpoints, endpointForProbe, recordProbe } from "../src/lib/store";

const shutdown = new AbortController();
const once = process.argv.includes("--once");
process.on("SIGINT", () => shutdown.abort());
process.on("SIGTERM", () => shutdown.abort());
const log = (event: string, fields: Record<string, unknown> = {}) => console.log(JSON.stringify({ at: new Date().toISOString(), event, ...fields }));
const lock = await pool.connect();
let lockLost = false;
lock.on("error", () => { lockLost = true; shutdown.abort(); });
const acquired = (await lock.query<{ acquired: boolean }>("SELECT pg_try_advisory_lock(420420777) AS acquired")).rows[0].acquired;
if (!acquired) { lock.release(); await pool.end(); throw new Error("Another Pulsegrid worker is already running"); }
const monitor = (await pool.query<{ id: string }>("SELECT id FROM monitors LIMIT 1")).rows[0];
if (!monitor) { await lock.query("SELECT pg_advisory_unlock(420420777)"); lock.release(); await pool.end(); throw new Error("Run the database setup command first"); }
await pool.query("UPDATE monitors SET started_at=now(),heartbeat_at=now(),state='starting',last_error=NULL WHERE id=$1", [monitor.id]);
log("worker_started", { monitorId: monitor.id, network: runtimeConfig().networkName });
let lastMaintenance = 0;
let lastLedger = 0;
let ledgerState = "not_deployed";
try {
  while (!shutdown.signal.aborted) {
    try {
      const endpoints = await dueEndpoints();
      const results = await Promise.allSettled(endpoints.map(async endpoint => {
        const result = await probeEndpoint(endpointForProbe(endpoint));
        const stored = await recordProbe(endpoint.id, result, monitor.id);
        log("probe", { endpointId: endpoint.id, success: result.success, code: result.errorCode, latencyMs: result.latencyMs, action: stored.action, simulated: result.simulated });
      }));
      if (results.some(result => result.status === "rejected")) log("probe_persistence_failed");
      if (Date.now() - lastLedger >= 5000) {
        try { ledgerState = await ledgerTick(); }
        catch { ledgerState = "rpc_unavailable"; log("ledger_rpc_unavailable"); }
        lastLedger = Date.now();
      }
      await pool.query("UPDATE monitors SET heartbeat_at=now(),state=$2,last_error=NULL WHERE id=$1", [monitor.id, `observing:${ledgerState}`]);
      if (Date.now() - lastMaintenance >= 3600000) {
        await pool.query("DELETE FROM health_checks WHERE checked_at<now()-interval '48 hours'");
        lastMaintenance = Date.now();
      }
    } catch {
      log("monitoring_cycle_failed", { reason: "database_or_configuration_unavailable" });
      await pool.query("UPDATE monitors SET heartbeat_at=now(),state='degraded',last_error='Monitoring cycle could not be persisted' WHERE id=$1", [monitor.id]).catch(() => undefined);
      if (once) process.exitCode = 1;
    }
    if (once) break;
    await sleep(1000, undefined, { signal: shutdown.signal }).catch(() => undefined);
  }
} finally {
  if (!once) await pool.query("UPDATE monitors SET state='stopped',heartbeat_at=now() WHERE id=$1", [monitor.id]).catch(() => undefined);
  if (!lockLost) await lock.query("SELECT pg_advisory_unlock(420420777)").catch(() => undefined);
  lock.release();
  await pool.end();
  log(once ? "worker_cycle_finished" : "worker_stopped", { lockLost });
  if (lockLost) process.exitCode = 1;
}
