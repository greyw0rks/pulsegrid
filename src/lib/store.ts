import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { Hex } from "viem";
import { pool, transaction } from "./db";
import { buildEvidence } from "./evidence";
import { detect } from "./policy";
import type { EndpointKind, ProbeEndpoint, ProbeResult, StoredCheck } from "./types";

export type EndpointRow = {
  id: Hex; name: string; url: string; kind: EndpointKind; expected_chain_id: number | null;
  expected_genesis_hash: Hex | null; interval_ms: number; timeout_ms: number; failure_threshold: number;
  recovery_threshold: number; enabled: boolean; simulated: boolean; fault_mode: "normal" | "timeout";
  consecutive_failures: number; consecutive_successes: number; active_incident_id: string | null;
  last_checked_at: Date | null; last_height: string | null; height_changed_at: Date | null;
};
export type CheckRow = {
  id: string; endpoint_id: Hex; monitor_id: string; checked_at: Date; success: boolean; latency_ms: number;
  chain_id: number | null; block_height: string | null; genesis_hash: Hex | null; error_code: ProbeResult["errorCode"];
  warnings: string[]; methods: string[]; simulated: boolean;
};
export function checkFromRow(row: CheckRow): StoredCheck {
  return { id: row.id, endpointId: row.endpoint_id, monitorId: row.monitor_id, checkedAt: row.checked_at.toISOString(),
    success: row.success, latencyMs: row.latency_ms, chainId: row.chain_id, blockHeight: row.block_height,
    genesisHash: row.genesis_hash, errorCode: row.error_code, warnings: row.warnings, methods: row.methods, simulated: row.simulated };
}
export function endpointForProbe(row: EndpointRow): ProbeEndpoint {
  return { id: row.id, url: row.url, kind: row.kind, expectedChainId: row.expected_chain_id,
    expectedGenesisHash: row.expected_genesis_hash, timeoutMs: row.timeout_ms, simulated: row.simulated, faultMode: row.fault_mode };
}
export async function dueEndpoints(lookAheadMs = 0): Promise<EndpointRow[]> {
  if (!Number.isInteger(lookAheadMs) || lookAheadMs < 0 || lookAheadMs > 5000) throw new Error("Invalid endpoint scheduling tolerance");
  return (await pool.query<EndpointRow>("SELECT * FROM endpoints WHERE enabled AND next_check_at <= now() + ($1 * interval '1 millisecond') ORDER BY next_check_at LIMIT 4", [lookAheadMs])).rows;
}
async function retainEvidence(client: PoolClient, evidence: ReturnType<typeof buildEvidence>) {
  await client.query("INSERT INTO evidence(hash,canonical_json,bundle) VALUES($1,$2,$3) ON CONFLICT(hash) DO NOTHING", [evidence.hash, evidence.canonical, JSON.stringify(evidence.bundle)]);
}
export async function timelineEvent(client: PoolClient, incidentId: string, type: string, at: string | Date, detail: string, key: string, tx: string | null = null) {
  await client.query(`INSERT INTO timeline(id,incident_id,type,occurred_at,detail,source_key,transaction_hash)
    VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(source_key) DO NOTHING`, [randomUUID(), incidentId, type, at, detail, key, tx]);
}

export async function recordProbe(endpointId: Hex, result: ProbeResult, monitorId: string): Promise<{ checkId: string; action: string | null; incidentId: string | null }> {
  return transaction(async client => {
    const endpoint = (await client.query<EndpointRow>("SELECT * FROM endpoints WHERE id=$1 FOR UPDATE", [endpointId])).rows[0];
    if (!endpoint) throw new Error("Endpoint no longer exists");
    const checkId = randomUUID();
    const changed = result.blockHeight !== null && result.blockHeight !== endpoint.last_height;
    const heightChangedAt = changed ? result.checkedAt : endpoint.height_changed_at?.toISOString() ?? result.checkedAt;
    const warnings = [...result.warnings];
    if (result.success && result.blockHeight !== null && !changed && Date.parse(result.checkedAt) - Date.parse(heightChangedAt) > 120000) warnings.push("BLOCK_NOT_ADVANCING");
    const check: StoredCheck = { ...result, warnings, id: checkId, endpointId, monitorId };
    await client.query(`INSERT INTO health_checks(id,endpoint_id,monitor_id,checked_at,success,latency_ms,chain_id,block_height,genesis_hash,error_code,warnings,methods,simulated)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [checkId, endpointId, monitorId, check.checkedAt, check.success, check.latencyMs, check.chainId, check.blockHeight, check.genesisHash, check.errorCode, JSON.stringify(warnings), JSON.stringify(check.methods), check.simulated]);
    const detection = detect({ failures: endpoint.consecutive_failures, successes: endpoint.consecutive_successes,
      activeIncidentId: endpoint.active_incident_id, lastCheckedAt: endpoint.last_checked_at?.toISOString() ?? null }, check,
      { failureThreshold: endpoint.failure_threshold, recoveryThreshold: endpoint.recovery_threshold, intervalMs: endpoint.interval_ms });
    let activeId = endpoint.active_incident_id;
    let transitionId: string | null = null;
    if (detection.action) {
      const count = detection.action === "open" ? endpoint.failure_threshold : endpoint.recovery_threshold;
      const checks = (await client.query<CheckRow>("SELECT * FROM health_checks WHERE endpoint_id=$1 ORDER BY checked_at DESC LIMIT $2", [endpointId, count])).rows.map(checkFromRow);
      const incidentId = detection.action === "open" ? randomUUID() : activeId!;
      const evidence = buildEvidence(incidentId, endpointId, detection.action, checks);
      await retainEvidence(client, evidence);
      if (detection.action === "open") {
        await client.query(`INSERT INTO incidents(id,report_key,endpoint_id,severity,failure_code,failure_count,observed_at,detected_at,evidence_hash,simulated)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [incidentId, evidence.bundle.reportKey, endpointId, check.errorCode === "CHAIN_MISMATCH" || check.errorCode === "GENESIS_MISMATCH" ? 3 : 2,
          check.errorCode, count, evidence.bundle.observedFrom, check.checkedAt, evidence.hash, evidence.bundle.simulated]);
        await timelineEvent(client, incidentId, "observation", evidence.bundle.observedFrom, `First failed observation: ${check.errorCode}`, `${incidentId}:first-observation`);
        await timelineEvent(client, incidentId, "detected", check.checkedAt, `${count} consecutive failed checks; opening evidence retained`, `${incidentId}:detected`);
        activeId = incidentId;
      } else {
        await client.query("UPDATE incidents SET recovered_at=$2,resolution_hash=$3,ledger_status='resolution_queued' WHERE id=$1", [incidentId, check.checkedAt, evidence.hash]);
        await timelineEvent(client, incidentId, "recovery", check.checkedAt, `${count} consecutive successful checks; recovery observed`, `${incidentId}:recovery`);
        activeId = null;
      }
      await client.query("INSERT INTO outbox(id,incident_id,kind,evidence_hash) VALUES($1,$2,$3,$4) ON CONFLICT(incident_id,kind) DO NOTHING", [randomUUID(), incidentId, detection.action, evidence.hash]);
      transitionId = incidentId;
    }
    await client.query(`UPDATE endpoints SET consecutive_failures=$2,consecutive_successes=$3,active_incident_id=$4,
      last_checked_at=$5,next_check_at=$5::timestamptz + interval_ms * interval '1 millisecond',
      last_height=COALESCE($6,last_height),height_changed_at=$7 WHERE id=$1`,
      [endpointId, Math.min(detection.state.failures, 1000000000), Math.min(detection.state.successes, 1000000000), activeId, check.checkedAt, check.blockHeight, heightChangedAt]);
    return { checkId, action: detection.action, incidentId: transitionId };
  });
}
