"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { decodeFunctionData, encodeFunctionData, parseEther } from "viem";
import { appPath } from "@/lib/paths";
import { formatDate, shortHash } from "@/lib/format";
import { walletRegistryAbi } from "@/lib/wallet-registry-abi";
import type { WalletReportOverview } from "@/lib/wallet-report-types";
import { StatusBadge } from "./status-badge";

type Provider = { request(input: { method: string; params?: unknown[] }): Promise<unknown>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void; removeListener?: (event: string, handler: (...args: unknown[]) => void) => void };
function provider(): Provider | undefined { return (window as Window & { ethereum?: Provider }).ethereum; }
type Proposal = { error?: string; maximumFeeBOT: string; evidenceHash: string;
  transaction: { from: string; to: string; data: `0x${string}`; value: string; chainId: string; gas: string; gasPrice: string } };
const storageKey = "pulsegrid:pending-wallet-report:677";

export function WalletReportsPanel({ initial }: { initial: WalletReportOverview }) {
  const [data, setData] = useState(initial);
  const [account, setAccount] = useState("");
  const [selection, setSelection] = useState(initial.sources[0]?.id ?? "");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendingHash, setPendingHash] = useState("");
  const [confirmedHash, setConfirmedHash] = useState("");
  const submitting = useRef(false);
  const refresh = useCallback(async () => {
    const response = await fetch(appPath("/api/wallet-reports"), { cache: "no-store" });
    if (!response.ok) throw new Error("Wallet report records are temporarily unavailable.");
    const next = await response.json() as WalletReportOverview;
    setData(next);
    setSelection(selected => next.sources.some(source => source.id === selected) ? selected : next.sources[0]?.id ?? "");
  }, []);
  useEffect(() => {
    const initialLoad = setTimeout(() => {
      void refresh().catch(() => {});
      try {
        const stored = localStorage.getItem(storageKey);
        if (stored && /^0x[0-9a-fA-F]{64}$/.test(stored)) setPendingHash(stored);
      } catch { setNotice("Browser storage is unavailable. Keep each submitted BOTScan link before leaving this page."); }
    }, 0);
    const timer = setInterval(() => void refresh().catch(() => {}), 30000);
    const changed = () => { setAccount(""); setNotice("Wallet account or network changed. Connect the wallet again before reporting."); };
    const wallet = provider();
    wallet?.on?.("accountsChanged", changed); wallet?.on?.("chainChanged", changed);
    return () => { clearTimeout(initialLoad); clearInterval(timer); wallet?.removeListener?.("accountsChanged", changed); wallet?.removeListener?.("chainChanged", changed); };
  }, [refresh]);
  useEffect(() => {
    if (!pendingHash) return;
    let stopped = false;
    const check = async () => {
      try {
        const response = await fetch(appPath(`/api/wallet-reports/receipt?hash=${pendingHash}`), { cache: "no-store" });
        const result = await response.json() as { state?: string; error?: string };
        if (stopped) return;
        if (!response.ok) { setNotice(result.error ?? "Receipt verification is temporarily unavailable. The submitted transaction is retained."); return; }
        if (result.state === "confirmed" || result.state === "failed") {
          try { localStorage.removeItem(storageKey); } catch { /* The receipt remains verifiable without browser storage. */ }
          setPendingHash("");
          if (result.state === "confirmed") { setConfirmedHash(pendingHash); setNotice("Confirmed on BOT Chain. The receipt, signing wallet, and original evidence match."); }
          else setNotice("The transaction reverted on chain. Review its BOTScan receipt before trying again.");
          await refresh();
        }
      } catch { if (!stopped) setNotice("Waiting for receipt verification. Your submitted transaction is retained."); }
    };
    void check(); const timer = setInterval(() => void check(), 5000);
    return () => { stopped = true; clearInterval(timer); };
  }, [pendingHash, refresh]);
  const source = data.sources.find(source => source.id === selection);
  const ownRecord = data.records.find(record => record.reporter.toLowerCase() === account.toLowerCase() && record.reportKey === source?.reportKey);
  const allowed = data.reporters.some(reporter => reporter.address.toLowerCase() === account.toLowerCase() && reporter.enabled);
  async function connect() {
    const wallet = provider();
    if (!wallet) { setNotice("Open this page in a browser with an EVM wallet extension to report."); return; }
    setBusy(true);
    try {
      const accounts = await wallet.request({ method: "eth_requestAccounts" }) as string[];
      if (!accounts[0]) throw new Error("No wallet account was selected.");
      const network = await wallet.request({ method: "eth_chainId" });
      if (BigInt(network as string) !== 677n) {
        try { await wallet.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x2a5" }] }); }
        catch (error) {
          if ((error as { code?: number }).code !== 4902) throw error;
          await wallet.request({ method: "wallet_addEthereumChain", params: [{ chainId: "0x2a5", chainName: "BOT Chain mainnet", nativeCurrency: { name: "BOT", symbol: "BOT", decimals: 18 }, rpcUrls: ["https://rpc.botchain.ai"], blockExplorerUrls: ["https://scan.botchain.ai"] }] });
          if (BigInt(await wallet.request({ method: "eth_chainId" }) as string) !== 677n) await wallet.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x2a5" }] });
        }
      }
      const current = await wallet.request({ method: "eth_accounts" }) as string[];
      if (!current[0] || BigInt(await wallet.request({ method: "eth_chainId" }) as string) !== 677n) throw new Error("Wallet or network selection changed.");
      setAccount(current[0]); setNotice(""); await refresh();
    } catch { setNotice("Wallet connection or BOT Chain network selection was not completed."); }
    finally { setBusy(false); }
  }
  async function submit(action: "open" | "resolve") {
    const wallet = provider();
    if (!wallet || !source || !account || !data.registry || submitting.current || pendingHash) return;
    submitting.current = true;
    setBusy(true); setConfirmedHash("");
    try {
      const accounts = await wallet.request({ method: "eth_accounts" }) as string[];
      const network = await wallet.request({ method: "eth_chainId" });
      if (accounts[0]?.toLowerCase() !== account.toLowerCase() || BigInt(network as string) !== 677n) throw new Error("Connect the intended wallet on BOT Chain before submitting.");
      const response = await fetch(appPath("/api/wallet-reports/prepare"), { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account, incidentId: source.id, action }) });
      const proposal = await response.json() as Proposal;
      if (!response.ok) throw new Error(proposal.error ?? "Report preparation failed.");
      const transaction = proposal.transaction;
      const decoded = decodeFunctionData({ abi: walletRegistryAbi, data: transaction.data });
      const expectedEvidence = action === "open" ? source.openingEvidence : source.recoveryEvidence;
      if (!expectedEvidence) throw new Error("Selected source evidence is unavailable.");
      const expectedData = action === "open" ? encodeFunctionData({ abi: walletRegistryAbi, functionName: "openIncident", args: [source.reportKey, source.endpointId, source.severity, source.openingEvidence] })
        : encodeFunctionData({ abi: walletRegistryAbi, functionName: "resolveIncident", args: [BigInt(ownRecord?.id ?? "0"), expectedEvidence] });
      if (transaction.to.toLowerCase() !== data.registry.toLowerCase() || transaction.from.toLowerCase() !== account.toLowerCase() || transaction.chainId !== "0x2a5" || BigInt(transaction.value) !== 0n || BigInt(transaction.gas) * BigInt(transaction.gasPrice) > parseEther("0.05") || proposal.evidenceHash !== expectedEvidence || transaction.data !== expectedData || decoded.functionName !== (action === "open" ? "openIncident" : "resolveIncident")) throw new Error("The prepared transaction did not match the selected wallet, source, registry, or fee limit.");
      // Check again after the server preflight; a provider may change accounts while preparing.
      const current = await wallet.request({ method: "eth_accounts" }) as string[];
      if (current[0]?.toLowerCase() !== account.toLowerCase() || BigInt(await wallet.request({ method: "eth_chainId" }) as string) !== 677n) throw new Error("The wallet changed while preparing the report. Reconnect before reporting.");
      setNotice(`Review the ${action === "open" ? "incident" : "recovery"} attestation in your wallet. Estimated maximum fee: ${proposal.maximumFeeBOT} BOT.`);
      const hash = await wallet.request({ method: "eth_sendTransaction", params: [transaction] });
      if (typeof hash !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(hash)) throw new Error("The wallet did not return a transaction hash. Check its activity before retrying.");
      setPendingHash(hash);
      try {
        localStorage.setItem(storageKey, hash);
        setNotice("Submitted to BOT Chain. Checking the successful receipt and matching evidence.");
      } catch { setNotice("Submitted to BOT Chain. Browser storage is unavailable; keep the transaction link while its receipt is checked."); }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The wallet did not complete the transaction.");
    } finally { submitting.current = false; setBusy(false); }
  }
  return <>
    <section className="section panel" aria-labelledby="wallet-access-heading">
      <div className="panel-head"><h2 id="wallet-access-heading">Reporter wallet</h2><StatusBadge status={data.state === "ready" ? "confirmed" : "pending"} label={data.state === "ready" ? "Contract verified" : data.state} /></div>
      <div className="deployment-content"><p>{data.reason}</p>
        {data.registry ? <p className="mono">Registry: <a href={`https://scan.botchain.ai/address/${data.registry}?tab=contract`}>{shortHash(data.registry)}</a></p> : null}
        <button className="button button-primary" type="button" onClick={() => void connect()} disabled={busy || !!pendingHash || data.state !== "ready"}>{account ? "Change connected wallet" : "Connect reporter wallet"}</button>
        {account ? <p className="section-note">Connected: <span className="mono">{shortHash(account)}</span> · {allowed ? "Approved reporter" : "Not approved for new reports"}</p> : null}
        <details className="section"><summary>Approved reporter addresses</summary><ul>{data.reporters.map(reporter => <li key={reporter.address} className="mono"><a href={`https://scan.botchain.ai/address/${reporter.address}`}>{reporter.address}</a> · {reporter.enabled ? "enabled" : "disabled"}</li>)}</ul></details>
      </div>
    </section>
    <section className="section" aria-labelledby="source-choice-heading">
      <div className="section-head"><h2 id="source-choice-heading">Retained incident evidence</h2></div>
      {source ? <div className="panel"><div className="deployment-content">
        <label htmlFor="wallet-source">Choose an observed incident</label><br />
        <select id="wallet-source" value={selection} onChange={event => setSelection(event.target.value)} disabled={busy || !!pendingHash} className="wallet-source-select">{data.sources.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
        <p className="section-note"><StatusBadge status={source.simulated ? "paused" : "confirmed"} label={source.simulated ? "Controlled drill source" : "Retained observations"} /></p>
        <p>Observed: {formatDate(source.observedAt)}. {source.simulated ? "The retained failure was simulated. Your transaction attests this historical drill record." : "Your transaction attests the retained monitor observations."}</p>
        <p><Link href={`/incidents/${source.id}`}>Review the original incident</Link> · <Link href={`/evidence/${source.openingEvidence}`}>Inspect opening evidence</Link>{source.recoveryEvidence ? <> · <Link href={`/evidence/${source.recoveryEvidence}`}>Inspect recovery evidence</Link></> : null}</p>
        <p>Each wallet submits its own report and can resolve only that report. Source documents retain the original monitor identity and observation time.</p>
        <div className="landing-actions"><button className="button button-primary" type="button" onClick={() => void submit("open")} disabled={!account || !allowed || !!ownRecord || busy || !!pendingHash || data.state !== "ready"}>Attest incident</button>
          <button className="button" type="button" onClick={() => void submit("resolve")} disabled={!account || !ownRecord || ownRecord.status !== 0 || !source.recoveryEvidence || busy || !!pendingHash || data.state !== "ready"}>Attest recovery</button></div>
        {ownRecord ? <p className="section-note">Your report #{ownRecord.id}: {ownRecord.status === 1 ? "recovery attested" : "incident attested; recovery available when evidence is retained"}.</p> : null}
      </div></div> : <div className="empty">No retained incident evidence is available for attestation.</div>}
      {notice ? <p className="section-note" role="status">{notice}</p> : null}
      {pendingHash || confirmedHash ? <p><a className="button" href={`https://scan.botchain.ai/tx/${pendingHash || confirmedHash}`}>Inspect {pendingHash ? "submitted transaction" : "confirmed transaction"} on BOTScan</a></p> : null}
    </section>
    <section className="section" aria-labelledby="wallet-receipts-heading"><div className="section-head"><h2 id="wallet-receipts-heading">Verified wallet receipts</h2></div>
      {!data.eventsAvailable ? <p>Transaction links are temporarily unavailable. No unverified transactions are included in the count.</p> : data.events.length ? <><p>{data.events.length} verified core transactions from {new Set(data.events.map(event => event.reporter.toLowerCase())).size} wallets{data.completeEventHistory ? "." : " in the recent explorer page; earlier transactions may exist."}</p><div className="endpoint-list">{data.events.map(event => <article className="panel" key={event.transactionHash}><div className="deployment-content"><h3>{event.action === "openIncident" ? "Incident attestation" : "Recovery attestation"} · report #{event.incidentId}</h3><p className="mono">Reporter: <a href={`https://scan.botchain.ai/address/${event.reporter}`}>{shortHash(event.reporter)}</a></p><p><StatusBadge status="confirmed" label="Receipt and evidence verified" /> · {event.simulated ? "Controlled drill source" : "Retained monitor evidence"}</p><a href={`https://scan.botchain.ai/tx/${event.transactionHash}`}>View transaction on BOTScan</a></div></article>)}</div></> : <p>No successful wallet-report receipts have been verified yet.</p>}
    </section>
  </>;
}
