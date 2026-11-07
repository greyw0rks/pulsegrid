import Link from "next/link";
import { Activity, ArrowUpRight, FileCheck2, RadioTower, ShieldCheck } from "lucide-react";
import { getOverview } from "@/lib/queries";
import { getDeploymentProof } from "@/lib/deployment";
import { formatDate } from "@/lib/format";

export async function BotLanding() {
  const [overview, proof] = await Promise.all([getOverview(), getDeploymentProof()]);
  const endpoint = overview.endpoints.find(item => !item.simulated);
  const verified = proof.state === "verified";
  return <div className="landing shell">
    <section className="landing-hero" aria-labelledby="landing-title">
      <div className="landing-copy">
        <div className="landing-eyebrow"><RadioTower size={14} aria-hidden="true" /> BOT CHAIN / RPC MONITORING</div>
        <h1 id="landing-title">Know what failed.<br /><span>Prove what recovered.</span></h1>
        <p className="landing-lede">Monitor BOT Chain RPC health, retain incident evidence, and follow recovery reports through to confirmed on-chain receipts.</p>
        <div className="landing-actions"><Link className="button button-primary" href="/dashboard">Open the dashboard <ArrowUpRight size={17} aria-hidden="true" /></Link><Link className="landing-text-link" href="/registry">Inspect the contract <ArrowUpRight size={15} aria-hidden="true" /></Link></div>
        <p className="landing-caption"><ShieldCheck size={15} aria-hidden="true" /> BOT Chain mainnet · chain ID 677</p>
      </div>
      <div className="signal-board" aria-label="BOT Chain deployment and retained observations">
        <div className="signal-board-head"><span className="mono">BOT CHAIN / MAINNET</span><span className="signal-chip">{verified ? "CONTRACT VERIFIED" : "DEPLOYMENT CHECK"}</span></div>
        <ol className="signal-stages">
          <li><span className="signal-index">01</span><div><strong>RPC observations</strong><small>{endpoint?.sampleCount ?? 0} retained checks · {endpoint?.status ?? "unobserved"}</small></div><Activity size={17} aria-hidden="true" /></li>
          <li><span className="signal-index">02</span><div><strong>Incident reports</strong><small>{overview.incidents.length} retained incidents</small></div><FileCheck2 size={17} aria-hidden="true" /></li>
          <li><span className="signal-index">03</span><div><strong>Confirmed registry events</strong><small>{overview.ledger.confirmed} successful incident/recovery receipts</small></div><ShieldCheck size={17} aria-hidden="true" /></li>
        </ol>
        <div className="signal-board-foot"><span>Latest check: {formatDate(endpoint?.latest?.checkedAt ?? null)}</span><Link href="/dashboard" aria-label="Review BOT Chain observations"><ArrowUpRight size={18} /></Link></div>
      </div>
    </section>
    <div className="landing-strip"><span>OBSERVE. RETAIN. CONFIRM.</span><a href="https://botchain.ai">BOT Chain <ArrowUpRight size={14} aria-hidden="true" /></a></div>
    <section className="landing-section" aria-labelledby="workflow-title">
      <div className="landing-section-head"><div className="landing-eyebrow">FROM FIRST CHECK TO FINAL RECEIPT</div><h2 id="workflow-title">One incident.<br />The whole story.</h2><p>Review the original checks, separate opening and recovery evidence, and confirmed registry transactions.</p></div>
      <div className="landing-feature-grid">{[
        { icon: Activity, title: "Watch the endpoint.", text: "Retain RPC response times, chain identity, block heights, and failed checks." },
        { icon: FileCheck2, title: "Keep the evidence.", text: "Incident and recovery reports retain separate source documents with verifiable hashes." },
        { icon: ShieldCheck, title: "Confirm the receipt.", text: "Follow submitted reports to successful transactions and matching contract state." }
      ].map((item,index)=><article className="landing-feature" key={item.title}><div><item.icon size={24} strokeWidth={1.5} aria-hidden="true" /><span>0{index+1}</span></div><h3>{item.title}</h3><p>{item.text}</p></article>)}</div>
    </section>
    <section className="landing-proof" aria-labelledby="proof-title"><div><div className="landing-eyebrow">EVIDENCE YOU CAN INSPECT</div><h2 id="proof-title">A verifiable<br />mainnet registry.</h2><p>{proof.reason}</p><Link className="landing-text-link" href="/registry">Inspect the deployment proof <ArrowUpRight size={16} aria-hidden="true" /></Link></div>
      <dl><div><dt>Chain ID</dt><dd>677</dd></div><div><dt>Network</dt><dd>BOT mainnet</dd></div><div><dt>Deployment block</dt><dd>{proof.record?.blockNumber ?? "Pending"}</dd></div><div><dt>Explorer</dt><dd><a href="https://scan.botchain.ai">BOTScan</a></dd></div></dl>
    </section>
    <section className="landing-section landing-boundary"><div className="landing-eyebrow">REPORTS AND OBSERVATIONS</div><h2>Reports you can verify.<br />Observations you can assess.</h2><p>The registry records what its authorized reporter submits. Monitoring is scheduled every five minutes; delayed checks are shown as stale. An attestation does not independently establish a network-wide outage.</p><p><a href="https://pulsegrid-psi.vercel.app">Open the existing Portaldot deployment</a></p></section>
  </div>;
}
