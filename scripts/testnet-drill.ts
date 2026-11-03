import { mkdir, writeFile } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";
import { formatEther, keccak256, stringToHex } from "viem";
import { pool } from "../src/lib/db";
import { endpointIdFor } from "../src/lib/evidence";
import { chainClients, registryAbi } from "../src/lib/registry";

const { config, account, publicClient } = chainClients();
if (config.network !== "testnet" || !config.registry || !account) throw new Error("A funded, deployed testnet registry is required");
const endpointId = endpointIdFor(`controlled-testnet-drill:${config.registry.toLowerCase()}`);
const reportPath = `docs/evidence/testnet-drill-${config.registry.toLowerCase()}.json`;
const sampleHash = keccak256(stringToHex(`Gas estimate only:${endpointId}`));
let created = false;
let completed = false;
async function waitFor(label: string, read: () => Promise<boolean>, timeout = 180000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await read()) { console.log(JSON.stringify({ event: "testnet_drill_step", step: label })); return; }
    await sleep(1000);
  }
  throw new Error(`Timed out awaiting ${label}; reconcile retained outbox transactions before another drill`);
}

try {
  if (await publicClient.getChainId() !== config.chainId) throw new Error("Testnet chain mismatch");
  const [gas, price, balance, authorized] = await Promise.all([
    publicClient.estimateContractGas({ address: config.registry, account, abi: registryAbi, functionName: "openIncident", args: [sampleHash, endpointId, 2, sampleHash] }),
    publicClient.getGasPrice(), publicClient.getBalance({ address: account.address }),
    publicClient.readContract({ address: config.registry, abi: registryAbi, functionName: "authorizedReporter" })
  ]);
  if (authorized.toLowerCase() !== account.address.toLowerCase()) throw new Error("Reporter mismatch");
  const reserve = gas * price * 2n; // Reserve the full opening cost again for recovery; no extra funding is automatic.
  if (reserve > balance || reserve > 75n * 10n ** 18n) throw new Error(`Drill reserve ${formatEther(reserve)} exceeds balance or 75 tPOT budget`);
  console.log(JSON.stringify({ event: "testnet_drill_preflight", openingEstimateTPOT: formatEther(gas * price), reserveTPOT: formatEther(reserve), balanceTPOT: formatEther(balance), simulated: true, submitted: false }));
  if (!process.argv.includes("--submit")) process.exitCode = 0;
  else {
    const monitor = (await pool.query<{ id: string; state: string; heartbeat_at: Date }>("SELECT id,state,heartbeat_at FROM monitors LIMIT 1")).rows[0];
    if (!monitor || monitor.state !== "observing:ready" || Date.now() - monitor.heartbeat_at.getTime() > 30000) throw new Error("Worker is not ready for the deployed registry");
    // A separate simulated endpoint keeps official endpoint health untouched.
    await pool.query(`INSERT INTO endpoints(id,name,url,kind,expected_chain_id,interval_ms,timeout_ms,failure_threshold,recovery_threshold,enabled,simulated)
      VALUES($1,'Controlled testnet recovery drill',$2,'evm',$3,5000,15000,2,2,true,true)`, [endpointId, config.evmRpc, config.chainId]);
    created = true;
    await waitFor("baseline observations", async () => Number((await pool.query("SELECT count(*) FROM health_checks WHERE endpoint_id=$1 AND success", [endpointId])).rows[0].count) >= 2);
    await pool.query("UPDATE endpoints SET fault_mode='timeout',next_check_at=now() WHERE id=$1", [endpointId]);
    await waitFor("opening receipt confirmed", async () => (await pool.query("SELECT ledger_status FROM incidents WHERE endpoint_id=$1", [endpointId])).rows[0]?.ledger_status === "open_confirmed");
    await pool.query("UPDATE endpoints SET fault_mode='normal',next_check_at=now() WHERE id=$1", [endpointId]);
    await waitFor("recovery receipt confirmed", async () => (await pool.query("SELECT ledger_status FROM incidents WHERE endpoint_id=$1", [endpointId])).rows[0]?.ledger_status === "resolved");
    const incident = (await pool.query("SELECT * FROM incidents WHERE endpoint_id=$1", [endpointId])).rows[0];
    const evidence = (await pool.query<{ hash: string; canonical_json: string }>("SELECT hash,canonical_json FROM evidence WHERE hash IN ($1,$2)", [incident.evidence_hash, incident.resolution_hash])).rows;
    const events = (await pool.query("SELECT transaction_hash,event_name,evidence_hash,block_number FROM registry_events WHERE incident_id=$1", [incident.chain_incident_id])).rows;
    if (events.length !== 2 || evidence.length !== 2 || incident.evidence_hash === incident.resolution_hash) throw new Error("Distinct evidence and matching chain events were not retained");
    const evidenceDirectory = "docs/evidence/testnet-drill";
    await mkdir(evidenceDirectory, { recursive: true });
    for (const document of evidence) await writeFile(`${evidenceDirectory}/${document.hash}.json`, document.canonical_json);
    const report = { schema: "pulsegrid.testnet-drill.v1", checkedAt: new Date().toISOString(), chainId: config.chainId, network: config.networkName, registry: config.registry,
      simulated: true, endpointId, incidentId: incident.id, chainIncidentId: incident.chain_incident_id,
      openingEvidence: incident.evidence_hash, recoveryEvidence: incident.resolution_hash, openingTransaction: incident.open_tx_hash, recoveryTransaction: incident.resolve_tx_hash,
      events, evidenceDirectory, reporterBalanceTPOT: formatEther(await publicClient.getBalance({ address: account.address })),
      note: "Controlled timeout and recovery on a dedicated simulated endpoint, with genuine public testnet transactions and receipts. This is an execution drill, not evidence of an official RPC outage." };
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
    completed = true;
    console.log(JSON.stringify({ event: "testnet_drill_passed", ...report, reportPath }, null, 2));
  }
} finally {
  if (created) await pool.query("UPDATE endpoints SET fault_mode='normal',enabled=$2 WHERE id=$1", [endpointId, !completed]);
  await pool.end();
}
