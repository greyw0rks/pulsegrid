"use client";

import { useRef, useState, type FormEvent } from "react";
import { KeyRound, Pause, Play, Plus, RefreshCw } from "lucide-react";
import { StatusBadge } from "./status-badge";
import { formatDate } from "@/lib/format";
import type { Overview } from "@/lib/types";

export function OperatorConsole({ initial, tokenConfigured, allowedHosts, scheduledMonitoring = false }: { initial: Overview; tokenConfigured: boolean; allowedHosts: string[]; scheduledMonitoring?: boolean }) {
  const [overview, setOverview] = useState(initial);
  const [token, setToken] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);

  async function request(path: string, method = "GET", body?: unknown) {
    const response = await fetch(path, { method, cache: "no-store", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const data = await response.json();
    if (response.status === 401) { setUnlocked(false); throw new Error("Operator token was not accepted. Enter the configured token and try again."); }
    if (!response.ok) throw new Error(data.error || "The operation could not be completed.");
    return data;
  }

  async function refresh() {
    const response = await fetch("/api/overview", { cache: "no-store" });
    if (!response.ok) throw new Error("Could not refresh endpoint observations.");
    const next = await response.json() as Overview;
    setOverview(next);
    if (!next.databaseAvailable) throw new Error(next.error || "Monitoring database is unavailable.");
  }

  async function run(key: string, action: () => Promise<void>) {
    if (busy) return;
    setBusy(key); setError(""); setMessage("");
    try { await action(); } catch (caught) { setError(caught instanceof Error ? caught.message : "The operation could not be completed."); }
    finally { setBusy(""); }
  }

  async function unlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await run("unlock", async () => { await request("/api/operator"); setUnlocked(true); setMessage("Operator controls unlocked for this page.");
      window.setTimeout(() => heading.current?.focus(), 0); });
  }

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    await run("add", async () => {
      await request("/api/endpoints", "POST", { name: data.get("name"), url: data.get("url"), kind: data.get("kind"),
        intervalSeconds: Number(data.get("interval")), failureThreshold: Number(data.get("failure")), recoveryThreshold: Number(data.get("recovery")) });
      form.reset(); await refresh(); setMessage("Endpoint registered. Observations will appear after the worker checks it.");
    });
  }

  return <>
    <section className="operator-access panel" aria-labelledby="access-heading">
      <div><KeyRound size={20} aria-hidden="true" /><h2 id="access-heading">Operator access</h2>
        <p className="muted">Your token stays in this page’s memory and is cleared when you leave or lock controls.</p></div>
      {!tokenConfigured ? <p role="status">Set PULSEGRID_OPERATOR_TOKEN in the server configuration to enable controls.</p> : unlocked ?
        <button className="button" onClick={() => { setToken(""); setUnlocked(false); setMessage("Controls locked."); setError(""); }} disabled={!!busy}>Lock controls</button> :
        <form onSubmit={unlock} className="operator-unlock"><label htmlFor="operator-token">Operator token</label>
          <input id="operator-token" type="password" autoComplete="off" value={token} onChange={event => setToken(event.target.value)} required disabled={!!busy} />
          <button className="button button-primary" disabled={!!busy}>{busy === "unlock" ? "Checking…" : "Unlock controls"}</button></form>}
    </section>
    {error ? <div className="notice" role="alert"><div><strong>Action needs attention</strong><p>{error}</p></div></div> : null}
    <p className="operator-message" role="status">{message}</p>
    <div className="operator-grid">
      <section className="panel" aria-labelledby="register-heading"><div className="panel-head"><h2 id="register-heading">Register an endpoint</h2></div>
        <form onSubmit={add} className="operator-form"><fieldset disabled={!unlocked || !!busy || !overview.databaseAvailable}>
          <label>Endpoint name<input name="name" required minLength={2} maxLength={60} placeholder="Primary EVM RPC" /></label>
          <label>Protocol<select name="kind" defaultValue="evm"><option value="evm">EVM · HTTPS</option><option value="native">Native · WebSocket</option></select></label>
          <label>RPC URL<input name="url" type="url" required placeholder="https://…" /></label>
          <div className="operator-fields"><label>Interval (seconds)<input name="interval" type="number" min={scheduledMonitoring ? 300 : 5} max={3600} defaultValue={scheduledMonitoring ? 300 : 30} required /></label>
            <label>Failures to open<input name="failure" type="number" min={1} max={10} defaultValue={3} required /></label>
            <label>Successes to recover<input name="recovery" type="number" min={1} max={10} defaultValue={3} required /></label></div>
          <button className="button button-primary" type="submit"><Plus size={15} aria-hidden="true" />{busy === "add" ? "Registering…" : "Register endpoint"}</button>
        </fieldset><p className="operator-help">Allowed hosts: {allowedHosts.join(", ") || "none configured"}. Credentials and query strings are rejected.</p></form>
      </section>
      <section className="panel" aria-labelledby="monitor-controls-heading"><div className="panel-head operator-section-head"><h2 id="monitor-controls-heading" tabIndex={-1} ref={heading}>Monitoring controls</h2>
        <button className="button" aria-label="Refresh observations" disabled={!!busy} onClick={() => void run("refresh", refresh)}><RefreshCw size={15} aria-hidden="true" /></button></div>
        {!overview.databaseAvailable ? <div className="empty">Monitoring database is unavailable.</div> : !overview.endpoints.length ? <div className="empty">Register your first endpoint to start observing.</div> :
          <div className="operator-endpoints">{overview.endpoints.map(endpoint => <article className="operator-endpoint" key={endpoint.id}>
            <div className="endpoint-title"><h3>{endpoint.name}</h3><StatusBadge status={endpoint.status} /></div>
            <p className="endpoint-url" title={endpoint.url}>{endpoint.url}</p>
            <p className="operator-help">Every {endpoint.intervalMs / 1000}s · open after {endpoint.failureThreshold} failures · recover after {endpoint.recoveryThreshold} successes</p>
            <p className="operator-help">Last checked: {formatDate(endpoint.latest?.checkedAt ?? null)}{endpoint.simulated ? " · Controlled drill" : ""}</p>
            <div className="operator-actions"><button className="button" disabled={!unlocked || !!busy} onClick={() => void run(endpoint.id, async () => {
              await request(`/api/endpoints/${endpoint.id}`, "PATCH", { enabled: !endpoint.enabled }); await refresh(); setMessage(`${endpoint.name} ${endpoint.enabled ? "paused" : "resumed"}.`);
            })}>{endpoint.enabled ? <Pause size={14} aria-hidden="true" /> : <Play size={14} aria-hidden="true" />}{endpoint.enabled ? "Pause monitoring" : "Resume monitoring"}</button>
              {overview.drillsEnabled && endpoint.simulated ? <button className="button" disabled={!unlocked || !!busy} onClick={() => void run(endpoint.id, async () => {
                const faultMode = endpoint.faultMode === "timeout" ? "normal" : "timeout";
                await request(`/api/drills/${endpoint.id}`, "POST", { faultMode }); await refresh(); setMessage(faultMode === "timeout" ? "Controlled timeout enabled. Await detection observations." : "Normal checks restored. Await recovery observations.");
              })}>{endpoint.faultMode === "timeout" ? "Restore checks" : "Inject timeout"}</button> : null}</div>
          </article>)}</div>}
      </section>
    </div>
  </>;
}
