import Link from "next/link";
import { AlertTriangle, Database, ExternalLink, ShieldCheck } from "lucide-react";
import { AutoRefresh } from "@/components/auto-refresh";
import { StatusBadge } from "@/components/status-badge";
import { TelemetryChart } from "@/components/telemetry-chart";
import { formatDate, formatPercent, ledgerLabel, shortHash } from "@/lib/format";
import { getOverview } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const overview = await getOverview();
  const monitored = overview.endpoints.filter(endpoint => endpoint.enabled);
  const healthy = monitored.filter(endpoint => endpoint.status === "healthy").length;
  const activeIncidents = overview.incidents.filter(incident => !incident.recoveredAt).length;

  return (
    <div className="page shell">
      <AutoRefresh />
      <header className="page-head">
        <div>
          <h1>{overview.network.mode === "bot-mainnet" ? "BOT Chain endpoint pulse" : "Portaldot endpoint pulse"}</h1>
          <p className="lede">Independent RPC observations, incident evidence, transaction state, and confirmed registry receipts.</p>
        </div>
        <div className="timestamp">Snapshot<br />{formatDate(overview.generatedAt)}</div>
      </header>

      {overview.error ? (
        <div className="notice" role="status">
          <Database aria-hidden="true" size={20} />
          <div><strong>Database is offline</strong><p>{overview.error}</p></div>
        </div>
      ) : null}

      <div className="network-note"><StatusBadge status={overview.network.mode === "local" ? "pending" : "unobserved"} label={overview.network.mode === "local" ? "Local integration chain · 31337" : overview.network.mode === "bot-mainnet" ? "BOT Chain mainnet · 677" : "Portaldot testnet · 420420777"} />
        <span>{overview.network.registry ? "Registry configured · confirmation tracked separately" : "Observation mode · registry deployment pending"}</span>
        <Link className="button" href="/operator">Manage endpoints</Link></div>

      <section className="summary-grid" aria-label="Network summary">
        <div className="summary-cell summary-primary">
          <div>
            <small>Network</small>
            <strong>{overview.network.name}</strong>
          </div>
          <StatusBadge status={overview.monitor.stale ? "stale" : overview.monitor.state} label={overview.monitor.stale ? "Worker heartbeat stale" : overview.monitor.state} />
        </div>
        <div className="summary-cell"><small>Healthy monitored endpoints</small><strong>{overview.databaseAvailable ? `${healthy}/${monitored.length}` : "—"}</strong></div>
        <div className="summary-cell"><small>Active incidents</small><strong>{overview.databaseAvailable ? activeIncidents : "—"}</strong></div>
        <div className="summary-cell"><small>Confirmed events</small><strong>{overview.databaseAvailable ? overview.ledger.confirmed : "—"}</strong></div>
      </section>

      <section className="section" aria-labelledby="endpoints-heading">
        <div className="section-head">
          <h2 id="endpoints-heading">Endpoint observations</h2>
          <p>Uptime and latency use retained checks from the last 24 hours. Topology is configured, not validator discovery.</p>
        </div>
        {overview.endpoints.length ? (
          <div className="endpoint-list">
            {overview.endpoints.map(endpoint => (
              <article className="endpoint" key={endpoint.id}>
                <div className="endpoint-main">
                  <div className="endpoint-title"><h3>{endpoint.name}</h3><StatusBadge status={endpoint.status} /></div>
                  <p className="endpoint-url" title={endpoint.url}>{endpoint.url}</p>
                  <div className="metrics">
                    <div className="metric"><span>24h uptime</span><strong>{formatPercent(endpoint.uptime)}</strong></div>
                    <div className="metric"><span>p50 latency</span><strong>{endpoint.p50 === null ? "-" : `${Math.round(endpoint.p50)} ms`}</strong></div>
                    <div className="metric"><span>p95 latency</span><strong>{endpoint.p95 === null ? "-" : `${Math.round(endpoint.p95)} ms`}</strong></div>
                    <div className="metric"><span>Latest block</span><strong>{endpoint.latest?.blockHeight ?? "-"}</strong></div>
                  </div>
                  <div className="endpoint-observation">{endpoint.sampleCount} checks in 24h · latest {formatDate(endpoint.latest?.checkedAt ?? null)}{endpoint.simulated ? " · Controlled drill" : ""}</div>
                  {endpoint.latest?.warnings.length ? <p className="endpoint-warnings">{endpoint.latest.warnings.map(warning => warning.replaceAll("_", " ").toLowerCase()).join(" · ")}</p> : null}
                </div>
                <TelemetryChart data={endpoint.history} />
              </article>
            ))}
          </div>
        ) : <div className="empty">Run the database setup command to register configured endpoints.</div>}
      </section>

      <section className="section" aria-labelledby="incidents-heading">
        <div className="section-head">
          <h2 id="incidents-heading">Incident ledger</h2>
          <p>Detection, signing, RPC submission, receipt confirmation, and observed recovery remain separate states.</p>
        </div>
        {overview.incidents.length ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Incident</th><th>Observed</th><th>Detection</th><th>Ledger</th><th>Evidence</th></tr></thead>
              <tbody>
                {overview.incidents.map(incident => (
                  <tr key={incident.id}>
                    <td><Link href={`/incidents/${incident.id}`}>{incident.endpointName}</Link><br /><span className="muted mono">severity {incident.severity}</span></td>
                    <td>{formatDate(incident.observedAt)}<br /><span className="muted">{incident.failureCount} failed checks</span></td>
                    <td><StatusBadge status={incident.recoveredAt ? "resolved" : "down"} label={incident.recoveredAt ? "Recovery observed" : incident.failureCode} /></td>
                    <td><StatusBadge status={incident.ledgerStatus} label={ledgerLabel(incident.ledgerStatus)} /></td>
                    <td><Link className="hash" href={`/evidence/${incident.evidenceHash}`} title={incident.evidenceHash}>{shortHash(incident.evidenceHash)}</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <div className="empty"><ShieldCheck aria-hidden="true" size={22} /><br />{overview.databaseAvailable ? "No incidents have been detected." : "Incident data is unavailable while the database is offline."}</div>}
      </section>

      <section className="section" aria-labelledby="integrity-heading">
        <div className="section-head"><h2 id="integrity-heading">Integrity boundary</h2></div>
        <div className="notice">
          <AlertTriangle aria-hidden="true" size={20} />
          <div><strong>Attestation is not independent outage proof</strong><p>Registry entries prove what the authorized Pulsegrid reporter submitted. Source observations and canonical evidence remain available for review.</p></div>
        </div>
        <div className="metrics">
          <div className="metric"><span>Chain ID</span><strong>{overview.network.chainId}</strong></div>
          <div className="metric"><span>Registry</span><strong title={overview.network.registry ?? undefined}>{shortHash(overview.network.registry)}</strong></div>
          <div className="metric"><span>Pending jobs</span><strong>{overview.ledger.pending}</strong></div>
          <div className="metric"><span>Failed jobs</span><strong>{overview.ledger.failed}</strong></div>
        </div>
        <p style={{ marginTop: 22 }}><a className="button" href={overview.network.nodeConsole} target="_blank" rel="noreferrer">{overview.network.mode === "bot-mainnet" ? "Open BOTScan" : "Open node console"} <ExternalLink aria-hidden="true" size={14} /></a></p>
      </section>
    </div>
  );
}
