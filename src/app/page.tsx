import type { Metadata } from "next";
import Link from "next/link";
import { Activity, ArrowDown, ArrowRight, ArrowUpRight, Check, FileCheck2, GitBranch, RadioTower, ShieldCheck } from "lucide-react";
import deployment from "../../docs/evidence/deployment-420420777-0x9c0d5b9cca49f69ffc7384d5da263689a21f7e22.json";
import drill from "../../docs/evidence/testnet-drill-0x9c0d5b9cca49f69ffc7384d5da263689a21f7e22.json";

export const metadata: Metadata = {
  title: "Pulsegrid — Know what failed. Prove what recovered.",
  description: "Independent Portaldot RPC monitoring. Trace an incident from the first failed check to verifiable evidence and confirmed on-chain recovery.",
  robots: { index: true, follow: true },
  openGraph: { title: "Pulsegrid — Know what failed. Prove what recovered.", description: "RPC observations, retrievable evidence, and confirmed Portaldot testnet receipts.", type: "website" }
};

const source = "https://github.com/greyw0rks/pulsegrid";

export default function LandingPage() {
  return <div className="landing shell">
    <section className="landing-hero" aria-labelledby="landing-title">
      <div className="landing-copy"><div className="landing-eyebrow"><RadioTower size={14} aria-hidden="true" /> PORTALDOT / NODE OPERATIONS</div>
        <h1 id="landing-title">Know what failed.<br /><span>Prove what recovered.</span></h1>
        <p className="landing-lede">A clear signal through the noise. Monitor your RPC endpoints, retain the evidence, and follow every incident through to a confirmed recovery.</p>
        <div className="landing-actions"><Link className="button button-primary" href="/dashboard">Open the dashboard <ArrowUpRight size={17} aria-hidden="true" /></Link>
          <a className="landing-text-link" href={source}>Explore the code <GitBranch size={15} aria-hidden="true" /></a></div>
        <p className="landing-caption"><ShieldCheck size={15} aria-hidden="true" /> Built and verified on Portaldot V3 testnet.</p>
      </div>
      <div className="signal-board" aria-label="Verified controlled testnet incident and recovery">
        <div className="signal-board-head"><span className="mono">PULSE / INCIDENT 001</span><span className="signal-chip"><Check size={12} aria-hidden="true" /> RECOVERY CONFIRMED</span></div>
        <div className="signal-wave" aria-hidden="true"><svg viewBox="0 0 440 140" fill="none"><path className="signal-baseline" d="M0 100H440M0 50H440M55 0V140M165 0V140M275 0V140M385 0V140" /><path className="signal-line" d="M0 87H78L91 70L107 103L123 23L139 116L157 69L170 86H228L242 99L256 38L271 109L286 76L300 87H440" /><circle cx="300" cy="87" r="4" /></svg></div>
        <ol className="signal-stages"><li><span className="signal-index">01</span><div><strong>Failure observed</strong><small>Two controlled timeout checks</small></div><Activity size={17} aria-hidden="true" /></li>
          <li><span className="signal-index">02</span><div><strong>Evidence committed</strong><small>Opening receipt · block {drill.events[0].block_number}</small></div><FileCheck2 size={17} aria-hidden="true" /></li>
          <li><span className="signal-index">03</span><div><strong>Recovery confirmed</strong><small>Recovery receipt · block {drill.events[1].block_number}</small></div><ShieldCheck size={17} aria-hidden="true" /></li></ol>
        <div className="signal-board-foot"><span>Verified controlled testnet drill · November 3, 2026</span><Link href={`/incidents/${drill.incidentId}`} aria-label="Review the verified controlled drill"><ArrowUpRight size={18} /></Link></div>
      </div>
    </section>
    <div className="landing-strip"><span>OBSERVE. RETAIN. CONFIRM.</span><a href="#how-it-works">Follow the signal <ArrowDown size={14} aria-hidden="true" /></a></div>
    <section className="landing-section" id="how-it-works" aria-labelledby="workflow-title">
      <div className="landing-section-head"><div className="landing-eyebrow">FROM FIRST CHECK TO FINAL RECEIPT</div><h2 id="workflow-title">One incident.<br />The whole story.</h2><p>See what the monitor observed, what it submitted, and what the chain confirmed. Every step stays available for review.</p></div>
      <div className="landing-feature-grid">{[
        { icon: Activity, number: "01", title: "Watch the endpoints.", text: "Check EVM and native RPC health. Follow block progress, retained latency, and failures across the endpoints you configure." },
        { icon: FileCheck2, number: "02", title: "Keep the evidence.", text: "Opening and recovery each get a separate canonical source document. Download it, recompute its digest, and inspect the observations." },
        { icon: ShieldCheck, number: "03", title: "Confirm the receipt.", text: "Track signed, submitted, and confirmed transactions independently. Registry events appear when the receipt and contract evidence match." }
      ].map(item => <article className="landing-feature" key={item.number}><div><item.icon size={24} strokeWidth={1.5} aria-hidden="true" /><span>{item.number}</span></div><h3>{item.title}</h3><p>{item.text}</p></article>)}</div>
    </section>
    <section className="landing-proof" aria-labelledby="proof-title"><div><div className="landing-eyebrow">EVIDENCE YOU CAN INSPECT</div><h2 id="proof-title">A working monitor.<br />A verifiable trail.</h2><p>The registry is deployed on testnet. A dedicated controlled drill completed both incident transitions through the actual worker, with distinct evidence and successful receipts.</p><Link className="landing-text-link" href="/registry">Inspect the registry <ArrowRight size={16} aria-hidden="true" /></Link></div>
      <dl><div><dt>Portaldot testnet</dt><dd>{deployment.chainId}</dd></div><div><dt>Confirmed drill events</dt><dd>{drill.events.length.toString().padStart(2, "0")}</dd></div><div><dt>Separate evidence documents</dt><dd>02</dd></div><div><dt>Registry deployed at block</dt><dd>{deployment.blockNumber}</dd></div></dl>
    </section>
    <section className="landing-section landing-boundary"><div className="landing-eyebrow">A CLEAR TRUST BOUNDARY</div><h2>Reports you can verify.<br />Observations you can question.</h2><p>Pulsegrid’s registry attests what its authorized reporter submitted. Source checks stay retrievable so you can assess the report. A controlled drill demonstrates execution; it does not establish an independent network outage.</p></section>
    <section className="landing-final"><div><div className="landing-eyebrow">YOUR NEXT CHECK STARTS HERE</div><h2>Find your network’s pulse.</h2></div><Link className="button button-primary" href="/dashboard">Open Pulsegrid <ArrowUpRight size={17} aria-hidden="true" /></Link></section>
  </div>;
}
