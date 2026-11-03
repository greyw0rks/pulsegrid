import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StatusBadge } from "@/components/status-badge";
import { formatDate, ledgerLabel, shortHash } from "@/lib/format";
import { getIncident } from "@/lib/queries";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return { title: `Incident ${id.slice(0, 8)}` };
}

export default async function IncidentPage({ params }: Props) {
  const { id } = await params;
  const record = await getIncident(id).catch(() => null);
  if (!record) notFound();
  const { incident, timeline } = record;
  return (
    <div className="page shell">
      <header className="page-head">
        <div><h1>{incident.endpointName}</h1><p className="lede">Detection evidence and ledger transitions for one independently observed endpoint incident.</p></div>
        <StatusBadge status={incident.ledgerStatus} label={ledgerLabel(incident.ledgerStatus)} />
      </header>

      <div className="detail-grid">
        <section className="panel" aria-labelledby="timeline-heading">
          <div className="panel-head"><h2 id="timeline-heading">Transition timeline</h2></div>
          {timeline.length ? <ol className="timeline">{timeline.map(item => (
            <li key={item.id}><time dateTime={item.occurredAt}>{formatDate(item.occurredAt)}</time><p>{item.detail}</p>{item.transactionHash ? <span className="hash" title={item.transactionHash}>{shortHash(item.transactionHash)}</span> : null}</li>
          ))}</ol> : <div className="empty">No transition records are available.</div>}
        </section>

        <aside className="panel" aria-labelledby="details-heading">
          <div className="panel-head"><h2 id="details-heading">Incident details</h2></div>
          <dl className="definition-list">
            <dt>Incident ID</dt><dd className="mono">{incident.id}</dd>
            <dt>Severity</dt><dd>{incident.severity}</dd>
            <dt>Failure</dt><dd>{incident.failureCode} after {incident.failureCount} checks</dd>
            <dt>First failure</dt><dd>{formatDate(incident.observedAt)}</dd>
            <dt>Detected</dt><dd>{formatDate(incident.detectedAt)}</dd>
            <dt>Recovery</dt><dd>{formatDate(incident.recoveredAt)}</dd>
            <dt>Report key</dt><dd className="mono">{incident.reportKey}</dd>
            <dt>Chain incident</dt><dd>{incident.chainIncidentId ?? "Not confirmed"}</dd>
            <dt>Reporter</dt><dd className="mono">{incident.reporter ?? "Not confirmed"}</dd>
            <dt>Simulation</dt><dd>{incident.simulated ? "Controlled drill" : "No"}</dd>
          </dl>
        </aside>
      </div>

      <section className="section" aria-labelledby="evidence-heading">
        <div className="section-head"><h2 id="evidence-heading">Evidence documents</h2><p>Each document is canonical UTF-8 JSON addressed by its Keccak-256 digest.</p></div>
        <div className="table-wrap"><table className="data-table"><thead><tr><th>Transition</th><th>Digest</th><th>Availability</th></tr></thead><tbody>
          <tr><td>Incident opened</td><td className="mono">{incident.evidenceHash}</td><td><Link href={`/evidence/${incident.evidenceHash}`}>Inspect source</Link></td></tr>
          {incident.resolutionHash ? <tr><td>Recovery observed</td><td className="mono">{incident.resolutionHash}</td><td><Link href={`/evidence/${incident.resolutionHash}`}>Inspect source</Link></td></tr> : null}
        </tbody></table></div>
      </section>
    </div>
  );
}
