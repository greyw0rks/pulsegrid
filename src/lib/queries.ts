import type { Hex } from "viem";
import { pool } from "./db";
import { projectPrivateKey, runtimeConfig } from "./env";
import { checkFromRow, type CheckRow, type EndpointRow } from "./store";
import type { EndpointView, IncidentView, Overview, TimelineEntry } from "./types";

type IncidentRow = {
  id: string; endpoint_id: Hex; endpoint_name: string; report_key: Hex; severity: number; failure_code: string;
  failure_count: number; observed_at: Date; detected_at: Date; recovered_at: Date | null; ledger_status: string;
  evidence_hash: Hex; resolution_hash: Hex | null; chain_incident_id: string | null; open_tx_hash: Hex | null;
  resolve_tx_hash: Hex | null; reporter: string | null; simulated: boolean; last_error: string | null;
};
const incidentSql = "SELECT i.*,e.name AS endpoint_name FROM incidents i JOIN endpoints e ON e.id=i.endpoint_id";
function incidentView(row: IncidentRow): IncidentView {
  return { id: row.id, endpointId: row.endpoint_id, endpointName: row.endpoint_name, reportKey: row.report_key,
    severity: row.severity, failureCode: row.failure_code, failureCount: row.failure_count, observedAt: row.observed_at.toISOString(),
    detectedAt: row.detected_at.toISOString(), recoveredAt: row.recovered_at?.toISOString() ?? null, ledgerStatus: row.ledger_status,
    evidenceHash: row.evidence_hash, resolutionHash: row.resolution_hash, chainIncidentId: row.chain_incident_id, openTxHash: row.open_tx_hash,
    resolveTxHash: row.resolve_tx_hash, reporter: row.reporter, simulated: row.simulated, lastError: row.last_error };
}
type TimelineRow = { id: string; type: string; occurred_at: Date; detail: string; transaction_hash: Hex | null };
function timelineView(row: TimelineRow): TimelineEntry {
  return { id: row.id, type: row.type, occurredAt: row.occurred_at.toISOString(), detail: row.detail, transactionHash: row.transaction_hash };
}

export async function getOverview(): Promise<Overview> {
  const config = runtimeConfig();
  let signerConfigured = false;
  try { signerConfigured = !!projectPrivateKey(); } catch { /* Invalid signer configuration stays unavailable. */ }
  const base: Overview = {
    generatedAt: new Date().toISOString(), databaseAvailable: false, error: null,
    network: { name: config.networkName, mode: config.network, chainId: config.chainId, registry: config.registry ?? null,
      signerConfigured, nodeConsole: config.nodeConsole },
    monitor: { id: null, heartbeatAt: null, startedAt: null, stale: true, state: "unavailable", lastError: null },
    endpoints: [], incidents: [], ledger: { confirmed: 0, pending: 0, failed: 0, latest: null }, drillsEnabled: config.drillsEnabled
  };
  try {
    const [endpoints, checks, stats, incidents, monitor, jobs, events, latest] = await Promise.all([
      pool.query<EndpointRow>("SELECT * FROM endpoints ORDER BY simulated,kind,name"),
      pool.query<CheckRow>(`SELECT * FROM (SELECT *,row_number() OVER(PARTITION BY endpoint_id ORDER BY checked_at DESC) AS rank FROM health_checks) h WHERE rank<=96 ORDER BY checked_at`),
      pool.query<{ endpoint_id: Hex; samples: string; failures: string; uptime: number; p50: number | null; p95: number | null }>(`SELECT endpoint_id,count(*) AS samples,count(*) FILTER(WHERE NOT success) AS failures,
        100.0*count(*) FILTER(WHERE success)/count(*) AS uptime,
        percentile_cont(0.5) WITHIN GROUP(ORDER BY latency_ms) FILTER(WHERE success) AS p50,
        percentile_cont(0.95) WITHIN GROUP(ORDER BY latency_ms) FILTER(WHERE success) AS p95
        FROM health_checks WHERE checked_at>now()-interval '24 hours' GROUP BY endpoint_id`),
      pool.query<IncidentRow>(`${incidentSql} ORDER BY i.detected_at DESC LIMIT 100`),
      pool.query<{ id: string; started_at: Date; heartbeat_at: Date; state: string; last_error: string | null }>("SELECT * FROM monitors ORDER BY heartbeat_at DESC LIMIT 1"),
      pool.query<{ state: string; count: string }>("SELECT state,count(*) FROM outbox GROUP BY state"),
      pool.query<{ count: string }>("SELECT count(*) FROM registry_events"),
      pool.query<TimelineRow>("SELECT * FROM timeline WHERE type IN ('opened_onchain','resolved_onchain') ORDER BY occurred_at DESC LIMIT 1")
    ]);
    base.databaseAvailable = true;
    base.endpoints = endpoints.rows.map(endpoint => {
      const history = checks.rows.filter(check => check.endpoint_id === endpoint.id).map(checkFromRow);
      const last = history.at(-1) ?? null;
      const measured = stats.rows.find(stat => stat.endpoint_id === endpoint.id);
      let status: EndpointView["status"] = "unobserved";
      if (!endpoint.enabled) status = "paused";
      else if (last && Date.now() - Date.parse(last.checkedAt) > endpoint.interval_ms * 2.5) status = "stale";
      else if (last && !last.success) status = "down";
      else if (last) status = last.warnings.length || endpoint.active_incident_id ? "degraded" : "healthy";
      return { id: endpoint.id, name: endpoint.name, url: endpoint.url, kind: endpoint.kind, enabled: endpoint.enabled,
        intervalMs: endpoint.interval_ms, failureThreshold: endpoint.failure_threshold, recoveryThreshold: endpoint.recovery_threshold,
        simulated: endpoint.simulated, faultMode: endpoint.fault_mode, latest: last, status,
        uptime: measured ? Number(measured.uptime) : null, p50: measured?.p50 ?? null, p95: measured?.p95 ?? null,
        sampleCount: Number(measured?.samples ?? 0), failureCount: Number(measured?.failures ?? 0),
        history: history.map(check => ({ at: check.checkedAt, latencyMs: check.success ? check.latencyMs : null, success: check.success, blockHeight: check.blockHeight })) };
    });
    base.incidents = incidents.rows.map(incidentView);
    const worker = monitor.rows[0];
    if (worker) base.monitor = { id: worker.id, heartbeatAt: worker.heartbeat_at.toISOString(), startedAt: worker.started_at.toISOString(),
      stale: Date.now() - worker.heartbeat_at.getTime() > config.heartbeatMaxAgeMs || worker.state === "stopped", state: worker.state, lastError: worker.last_error };
    base.ledger = { confirmed: Number(events.rows[0]?.count ?? 0),
      pending: jobs.rows.filter(job => ["queued", "submitted"].includes(job.state)).reduce((sum, job) => sum + Number(job.count), 0),
      failed: Number(jobs.rows.find(job => job.state === "exhausted")?.count ?? 0), latest: latest.rows[0] ? timelineView(latest.rows[0]) : null };
    return base;
  } catch {
    return { ...base, error: "Monitoring database unavailable. Start PostgreSQL and run the database setup command." };
  }
}

export async function getIncident(id: string) {
  const [incident, timeline] = await Promise.all([
    pool.query<IncidentRow>(`${incidentSql} WHERE i.id=$1`, [id]),
    pool.query<TimelineRow>("SELECT * FROM timeline WHERE incident_id=$1 ORDER BY occurred_at,id", [id])
  ]);
  if (!incident.rows[0]) return null;
  return { incident: incidentView(incident.rows[0]), timeline: timeline.rows.map(timelineView) };
}
export async function getEvidence(hash: string) {
  return (await pool.query<{ hash: Hex; canonical_json: string; bundle: unknown; created_at: Date }>("SELECT * FROM evidence WHERE hash=$1", [hash])).rows[0] ?? null;
}
export async function getRegistryEvents() {
  const result = await pool.query<{ transaction_hash: Hex; event_name: string; incident_id: string; endpoint_id: Hex; reporter: string; evidence_hash: Hex; block_number: string; chain_timestamp: Date }>("SELECT * FROM registry_events ORDER BY block_number DESC,log_index DESC LIMIT 100");
  return result.rows.map(row => ({ transactionHash: row.transaction_hash, eventName: row.event_name, incidentId: row.incident_id,
    endpointId: row.endpoint_id, reporter: row.reporter, evidenceHash: row.evidence_hash, blockNumber: row.block_number, at: row.chain_timestamp.toISOString() }));
}
