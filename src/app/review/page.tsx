import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import drill from "../../../docs/evidence/bot-drill-0x368d564dd8166d1967f21c7fbaaf87883ef85c83.json";
import { StatusBadge } from "@/components/status-badge";
import { getDeploymentProof } from "@/lib/deployment";
import { runtimeConfig } from "@/lib/env";
import { getRegistryEvents } from "@/lib/queries";
import { appPath } from "@/lib/paths";
import { shortHash } from "@/lib/format";
import { getWalletReportOverview } from "@/lib/wallet-reports";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "BOT Chain review evidence",
  description: "Pulsegrid's independent project description, BOT Chain incident and recovery receipts, source evidence, and reporter permissions.",
  robots: { index: true, follow: true }
};

export default async function ReviewPage() {
  if (runtimeConfig().network !== "bot-mainnet") notFound();
  const [proof, events, walletReports] = await Promise.all([
    getDeploymentProof(), getRegistryEvents().catch(() => []), getWalletReportOverview()
  ]);
  const transitions = [
    { name: "Incident attestation", method: "openIncident", hash: drill.openingTransaction, evidence: drill.openingEvidence, event: "IncidentOpened" },
    { name: "Recovery attestation", method: "resolveIncident", hash: drill.recoveryTransaction, evidence: drill.recoveryEvidence, event: "IncidentResolved" }
  ];
  return <div className="page shell">
    <header className="page-head"><div>
      <h1>Pulsegrid on BOT Chain</h1>
      <p className="lede">Pulsegrid is an independent RPC monitoring and recovery attestation project. It retains endpoint health checks, incident evidence, and separate recovery evidence, then links authorized reports to verifiable on-chain receipts. Its BOT Chain integration extends the existing Portaldot project.</p>
    </div><StatusBadge status={proof.state === "verified" ? "confirmed" : "pending"} label={proof.state === "verified" ? "Contract verified" : "Proof unavailable"} /></header>

    <section className="section" aria-labelledby="flow-heading">
      <div className="section-head"><h2 id="flow-heading">Incident and recovery flow</h2></div>
      <p>A controlled mainnet drill completed both attestations for incident #1. The transactions are genuine BOT Chain executions. The endpoint failure was simulated; this demonstrates product execution and does not establish an official BOT outage or independent adoption.</p>
      <p><Link className="button button-primary" href={`/incidents/${drill.incidentId}`}>Inspect the complete incident</Link></p>
      <div className="detail-grid">{transitions.map(transition => {
          const retained = events.some(event => event.transactionHash === transition.hash && event.eventName === transition.event && event.evidenceHash === transition.evidence);
          return <article className="panel" key={transition.hash}>
            <div className="panel-head"><h3>{transition.name}</h3></div>
            <dl className="definition-list">
              <dt>Core action</dt><dd className="mono">{transition.method}</dd>
              <dt>Receipt</dt><dd><StatusBadge status={retained ? "confirmed" : "unobserved"} label={retained ? "Confirmed receipt retained" : "Retained receipt unavailable"} /></dd>
              <dt>BOTScan transaction</dt><dd className="mono"><a href={`https://scan.botchain.ai/tx/${transition.hash}`} title={transition.hash}>{shortHash(transition.hash)}</a></dd>
              <dt>Source evidence</dt><dd><Link href={`/evidence/${transition.evidence}`}>Inspect source</Link><br /><a href={appPath(`/api/evidence/${transition.evidence}`)}>Download canonical JSON</a></dd>
            </dl>
          </article>;
        })}</div>
    </section>

    <section className="section panel" aria-labelledby="contract-heading">
      <div className="panel-head"><h2 id="contract-heading">Deployment and network</h2></div>
      <div className="deployment-content"><p>{proof.reason}</p>
        <dl className="deployment-facts">
          <div><dt>Network</dt><dd><a href="https://botchain.ai">BOT Chain</a> mainnet · chain ID 677</dd></div>
          <div><dt>Explorer</dt><dd><a href="https://scan.botchain.ai">BOTScan</a></dd></div>
          <div><dt>Verified contract source</dt><dd className="mono"><a href={`https://scan.botchain.ai/address/${drill.registry}?tab=contract`}>{drill.registry}</a></dd></div>
          <div><dt>Authorized reporter</dt><dd className="mono"><a href={`https://scan.botchain.ai/address/${drill.reporter}`}>{drill.reporter}</a></dd></div>
        </dl>
        <p><Link href="/registry">Inspect the live registry</Link> · <a href={appPath("/api/deployment")}>Download deployment proof</a> · <a href="https://github.com/greyw0rks/pulsegrid">Project source</a></p>
      </div>
    </section>

    <section className="section" aria-labelledby="permissions-heading">
      <div className="section-head"><h2 id="permissions-heading">Reporter permissions and review requirement</h2></div>
      <p>Both <code>openIncident</code> and <code>resolveIncident</code> require the single immutable <code>authorizedReporter</code> above. Calls from other wallets revert with <code>UnauthorizedReporter()</code>. This deployed contract has no function to add or change reporters.</p>
      <p>The original drill contains two successful core-product transactions from one reporter wallet. A separate wallet-reporting registry lets approved participants attest the retained evidence from their own wallets and resolve only their own reports.</p>
      <p>{walletReports.state === "ready" ? `The wallet-reporting registry is verified at ${walletReports.registry}.` : "The wallet-reporting registry is being prepared; participant reporting is not yet available."} Approval or gas funding alone does not establish participant usage.</p>
      <p>{walletReports.eventsAvailable ? `${walletReports.events.length} additional core transactions from ${new Set(walletReports.events.map(event => event.reporter.toLowerCase())).size} wallets have been verified${walletReports.completeEventHistory ? "." : " in the recent explorer page; earlier transactions may exist."}` : "Additional participant receipt links are not currently available for verification."} The review requires at least five successful core transactions across three wallets. Deployments and gas grants are excluded.</p>
      <p><Link className="button button-primary" href="/reports">Report with your wallet</Link></p>
      <p>RPC monitoring continues every five minutes. The owner has disabled automatic on-chain submissions; the completed drill receipts and evidence remain available.</p>
      <p><a href="https://pulsegrid-psi.vercel.app">Existing Portaldot application</a> · <Link href="/dashboard">BOT Chain dashboard</Link></p>
    </section>
  </div>;
}
