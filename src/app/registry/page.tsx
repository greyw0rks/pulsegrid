import type { Metadata } from "next";
import Link from "next/link";
import { StatusBadge } from "@/components/status-badge";
import { formatDate, shortHash } from "@/lib/format";
import { getRegistryEvents } from "@/lib/queries";
import { getDeploymentProof } from "@/lib/deployment";
import { AutoRefresh } from "@/components/auto-refresh";
import { runtimeConfig } from "@/lib/env";
import { appPath } from "@/lib/paths";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Registry events" };

export default async function RegistryPage() {
  const explorer = runtimeConfig().explorerUrl;
  const [result, proof] = await Promise.all([
    getRegistryEvents().then(events => ({ available: true, events })).catch(() => ({ available: false, events: [] })), getDeploymentProof()
  ]);
  const { available, events } = result;
  return (
    <div className="page shell">
      <AutoRefresh everyMs={30000} />
      <header className="page-head"><div><h1>Registry events</h1><p className="lede">Events retained only after a successful receipt and matching contract state are observed.</p></div><StatusBadge status={events.length ? "confirmed" : "unobserved"} label={`${events.length} retained`} /></header>
      <section className="section panel" aria-labelledby="deployment-heading">
        <div className="panel-head deployment-head"><h2 id="deployment-heading">Registry deployment</h2><StatusBadge status={proof.state === "verified" ? "confirmed" : "pending"} label={proof.state === "verified" ? "Verified on chain" : proof.state} /></div>
        <div className="deployment-content"><p className="muted">{proof.reason}</p>
          <dl className="deployment-facts"><div><dt>Network</dt><dd>{proof.network} · {proof.chainId}</dd></div>
            <div><dt>Contract</dt><dd className="mono">{proof.contract && explorer ? <a href={`${explorer}/address/${proof.contract}`}>{proof.contract}</a> : proof.contract ?? "Awaiting deployment"}</dd></div>
            {proof.record ? <><div><dt>Authorized reporter</dt><dd className="mono">{proof.record.reporter}</dd></div>
              <div><dt>Deployment transaction</dt><dd className="mono">{explorer ? <a href={`${explorer}/tx/${proof.record.transactionHash}`}>{proof.record.transactionHash}</a> : proof.record.transactionHash}</dd></div>
              <div><dt>Confirmed block</dt><dd>{proof.record.blockNumber}</dd></div></> : null}</dl>
          {proof.record ? <a className="button" href={appPath("/api/deployment")} download>Download deployment proof</a> : null}
        </div>
      </section>
      <section className="section">
        {events.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>Event</th><th>Chain record</th><th>Evidence</th><th>Confirmed</th></tr></thead><tbody>
          {events.map(event => <tr key={`${event.transactionHash}:${event.eventName}`}>
            <td><StatusBadge status="confirmed" label={event.eventName.replace(/([a-z])([A-Z])/g, "$1 $2")} /></td>
            <td>Incident #{event.incidentId}<br /><span className="hash" title={event.transactionHash}>{shortHash(event.transactionHash)}</span></td>
            <td><Link className="hash" href={`/evidence/${event.evidenceHash}`} title={event.evidenceHash}>{shortHash(event.evidenceHash)}</Link></td>
            <td>{formatDate(event.at)}<br /><span className="muted mono">block {event.blockNumber}</span></td>
          </tr>)}
        </tbody></table></div> : <div className="empty">{available ? "No successful registry receipts have been retained." : "Registry data is unavailable while the database is offline."}</div>}
      </section>
    </div>
  );
}
