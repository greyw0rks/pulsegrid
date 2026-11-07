import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { formatEther, keccak256, stringToHex, type Hex } from "viem";
import { pool } from "../src/lib/db";
import { endpointIdFor, evidenceSchema } from "../src/lib/evidence";
import { chainClients, registryAbi } from "../src/lib/registry";

const { config, account, publicClient } = chainClients();
if (config.network !== "bot-mainnet" || !account || config.registry?.toLowerCase() !== "0x368d564dd8166d1967f21c7fbaaf87883ef85c83") throw new Error("Verified BOT registry and authorized reporter are required");
const endpointId = endpointIdFor(`controlled-bot-drill:${config.registry.toLowerCase()}`);
const reportPath = `docs/evidence/bot-drill-${config.registry.toLowerCase()}.json`;
const registry = config.registry;
let created = false;
let completed = false;

async function tick() {
  await new Promise<void>((done, reject) => {
    const child = spawn(process.execPath, [resolve("scheduler/node_modules/convex/bin/main.js"), "run", "monitor:run", "{}", "--deployment", "sincere-hamster-832"], { cwd: resolve("scheduler"), stdio: ["ignore", "pipe", "pipe"] });
    child.stdout.resume();
    child.stderr.resume();
    const timer = setTimeout(() => { child.kill("SIGTERM"); reject(new Error("Convex monitoring cycle timed out; inspect retained queue before retrying")); }, 120000);
    child.once("error", () => { clearTimeout(timer); reject(new Error("Convex monitoring command failed to start")); });
    child.once("exit", code => { clearTimeout(timer); if (code === 0) done(); else reject(new Error(`Convex monitoring failed (exit ${code}); inspect retained queue`)); });
  });
}
async function waitFor(label: string, read: () => Promise<boolean>) {
  const deadline = Date.now() + 360000;
  while (Date.now() < deadline) {
    if (await read()) { console.log(JSON.stringify({ event: "bot_drill_step", step: label })); return; }
    await tick();
    await sleep(5500);
  }
  throw new Error(`Timed out awaiting ${label}; resume this same drill after reconciling the queue`);
}

try {
  if (existsSync(reportPath)) {
    const retained = JSON.parse(await readFile(reportPath, "utf8"));
    console.log(JSON.stringify({ event: "bot_drill_already_completed", reportPath, openingTransaction: retained.openingTransaction, recoveryTransaction: retained.recoveryTransaction }));
    completed = true;
  } else {
    const sampleHash = keccak256(stringToHex(`Estimate only:${endpointId}`));
    const [chainId, authorized, balance, gas, price] = await Promise.all([
      publicClient.getChainId(), publicClient.readContract({ address: registry, abi: registryAbi, functionName: "authorizedReporter" }),
      publicClient.getBalance({ address: account.address }), publicClient.estimateContractGas({ address: registry, account, abi: registryAbi, functionName: "openIncident", args: [sampleHash, endpointIdFor(`estimate-only:${registry}`), 2, sampleHash] }), publicClient.getGasPrice()
    ]);
    if (chainId !== 677 || authorized.toLowerCase() !== account.address.toLowerCase()) throw new Error("BOT network or reporter mismatch");
    const reserve = gas * price * 2n;
    if (reserve >= balance || reserve > 10n ** 17n) throw new Error("Drill exceeds reporter balance or 0.1 BOT reserve");
    console.log(JSON.stringify({ event: "bot_drill_preflight", simulated: true, openingEstimateBOT: formatEther(gas * price), reserveBOT: formatEther(reserve), balanceBOT: formatEther(balance), submitted: false }));
    if (process.argv.includes("--submit")) {
      // This separate endpoint is permanently labeled simulated. Only the existing Convex pipeline produces observations and submits transactions.
      await pool.query(`INSERT INTO endpoints(id,name,url,kind,expected_chain_id,interval_ms,timeout_ms,failure_threshold,recovery_threshold,enabled,simulated)
        VALUES($1,'Controlled BOT mainnet recovery drill',$2,'evm',677,30000,15000,2,2,true,true) ON CONFLICT(id) DO NOTHING`, [endpointId, config.evmRpc]);
      created = true;
      await pool.query("UPDATE endpoints SET interval_ms=30000 WHERE id=$1 AND simulated=true", [endpointId]);
      let incident = (await pool.query("SELECT * FROM incidents WHERE endpoint_id=$1 ORDER BY detected_at DESC LIMIT 1", [endpointId])).rows[0];
      if (!incident) {
        await pool.query("UPDATE endpoints SET enabled=true,fault_mode='normal',next_check_at=now() WHERE id=$1", [endpointId]);
        await waitFor("two baseline observations", async () => Number((await pool.query("SELECT count(*) FROM health_checks WHERE endpoint_id=$1 AND success", [endpointId])).rows[0].count) >= 2);
        await pool.query("UPDATE endpoints SET fault_mode='timeout',next_check_at=now() WHERE id=$1", [endpointId]);
        await waitFor("opening transaction confirmed", async () => (await pool.query("SELECT ledger_status FROM incidents WHERE endpoint_id=$1", [endpointId])).rows[0]?.ledger_status === "open_confirmed");
      } else if (incident.ledger_status !== "resolved") {
        await waitFor("retained opening transaction confirmed", async () => (await pool.query("SELECT ledger_status FROM incidents WHERE endpoint_id=$1", [endpointId])).rows[0]?.ledger_status === "open_confirmed");
      }
      await pool.query("UPDATE endpoints SET enabled=true,fault_mode='normal',next_check_at=now() WHERE id=$1", [endpointId]);
      await waitFor("recovery transaction confirmed", async () => (await pool.query("SELECT ledger_status FROM incidents WHERE endpoint_id=$1", [endpointId])).rows[0]?.ledger_status === "resolved");
      incident = (await pool.query("SELECT * FROM incidents WHERE endpoint_id=$1", [endpointId])).rows[0];
      const record = await publicClient.readContract({ address: registry, abi: registryAbi, functionName: "getIncident", args: [BigInt(incident.chain_incident_id)] });
      if (record.status !== 1 || record.endpointId !== endpointId || record.evidenceHash !== incident.evidence_hash || record.resolutionHash !== incident.resolution_hash || record.reporter.toLowerCase() !== account.address.toLowerCase()) throw new Error("Resolved on-chain record does not match retained evidence");
      const documents = (await pool.query<{ hash: Hex; canonical_json: string }>("SELECT hash,canonical_json FROM evidence WHERE hash IN ($1,$2)", [incident.evidence_hash, incident.resolution_hash])).rows;
      if (documents.length !== 2 || incident.evidence_hash === incident.resolution_hash) throw new Error("Distinct opening and recovery sources are required");
      const evidenceDirectory = "docs/evidence/bot-drill";
      await mkdir(evidenceDirectory, { recursive: true });
      for (const document of documents) {
        const bundle = evidenceSchema.parse(JSON.parse(document.canonical_json));
        if (!bundle.simulated || bundle.endpointId !== endpointId || keccak256(stringToHex(document.canonical_json)) !== document.hash) throw new Error("Controlled source integrity check failed");
        await writeFile(`${evidenceDirectory}/${document.hash}.json`, document.canonical_json);
      }
      const receipts = await Promise.all([incident.open_tx_hash, incident.resolve_tx_hash].map(hash => publicClient.getTransactionReceipt({ hash })));
      if (receipts.some(receipt => receipt.status !== "success" || receipt.to?.toLowerCase() !== registry.toLowerCase() || receipt.from.toLowerCase() !== account.address.toLowerCase())) throw new Error("Successful authorized registry receipts are required");
      const events = (await pool.query("SELECT transaction_hash,event_name,evidence_hash,block_number FROM registry_events WHERE incident_id=$1 ORDER BY block_number", [incident.chain_incident_id])).rows;
      if (events.length !== 2 || !events.some(event => event.event_name === "IncidentOpened" && event.evidence_hash === incident.evidence_hash && event.transaction_hash === incident.open_tx_hash) || !events.some(event => event.event_name === "IncidentResolved" && event.evidence_hash === incident.resolution_hash && event.transaction_hash === incident.resolve_tx_hash)) throw new Error("Exactly two matching retained registry events are required");
      const report = { schema: "pulsegrid.bot-drill.v1", checkedAt: new Date().toISOString(), chainId: 677, registry, reporter: account.address, simulated: true, endpointId,
        incidentId: incident.id, chainIncidentId: incident.chain_incident_id, openingEvidence: incident.evidence_hash, recoveryEvidence: incident.resolution_hash,
        openingTransaction: incident.open_tx_hash, recoveryTransaction: incident.resolve_tx_hash, events, evidenceDirectory,
        receipts: receipts.map(receipt => ({ transactionHash: receipt.transactionHash, status: receipt.status, blockNumber: receipt.blockNumber.toString(), paidFeeBOT: formatEther(receipt.gasUsed * receipt.effectiveGasPrice) })),
        execution: "Existing Convex monitor:run and private reporter:run actions", website: `https://pulsegrid-psi.vercel.app/bot/incidents/${incident.id}`,
        note: "Controlled simulated timeout and recovery on an isolated endpoint. Transactions and receipts are genuine BOT mainnet executions; this does not represent an official BOT RPC outage." };
      await writeFile(reportPath, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
      completed = true;
      console.log(JSON.stringify({ event: "bot_drill_passed", ...report, reportPath }));
    }
  }
} finally {
  // On interruption, allow genuine successful probes to resolve any already-open drill. On success, pause it permanently.
  if (created) await pool.query("UPDATE endpoints SET fault_mode='normal',enabled=$2,interval_ms=CASE WHEN $2 THEN 300000 ELSE interval_ms END,next_check_at=now() WHERE id=$1", [endpointId, !completed]);
  await pool.end();
}
