import { decodeEventLog, encodeFunctionData, keccak256, recoverTransactionAddress, stringToHex, TransactionReceiptNotFoundError, type Hex, type TransactionReceipt, type TransactionSerialized } from "viem";
import type { PoolClient } from "pg";
import { pool, transaction } from "./db";
import { chainClients, registryAbi } from "./registry";
import { timelineEvent } from "./store";
import { evidenceSchema } from "./evidence";
import { assertDailyReportingBudget, reportingTransactionCost } from "./reporting-policy";

type Clients = ReturnType<typeof chainClients>;
type Job = { id: string; incident_id: string; kind: "open" | "resolve"; evidence_hash: Hex; state: string; attempts: number;
  transaction_hash: Hex | null; raw_transaction: Hex | null; report_key: Hex; endpoint_id: Hex; severity: number; chain_incident_id: string | null };
type Event = { eventName: "IncidentOpened" | "IncidentResolved"; incidentId: bigint; endpointId: Hex; reporter: Hex; hash: Hex; timestamp: bigint; reportKey?: Hex };
class LedgerFailure extends Error { constructor(readonly code: string, readonly reverted = false) { super(code); } }

function decodeRegistryLog(log: TransactionReceipt["logs"][number]): Event | null {
  try {
    const decoded = decodeEventLog({ abi: registryAbi, data: log.data, topics: log.topics });
    if (decoded.eventName === "IncidentOpened") return { eventName: decoded.eventName, incidentId: decoded.args.incidentId,
      endpointId: decoded.args.endpointId, reporter: decoded.args.reporter, hash: decoded.args.evidenceHash, timestamp: decoded.args.openedAt, reportKey: decoded.args.reportKey };
    if (decoded.eventName === "IncidentResolved") return { eventName: decoded.eventName, incidentId: decoded.args.incidentId,
      endpointId: decoded.args.endpointId, reporter: decoded.args.reporter, hash: decoded.args.resolutionHash, timestamp: decoded.args.resolvedAt };
  } catch { /* Logs from another event are not incident evidence. */ }
  return null;
}
async function retainChainEvent(client: PoolClient, event: Event, tx: Hex, logIndex: number, block: bigint) {
  await client.query(`INSERT INTO registry_events(transaction_hash,log_index,block_number,event_name,incident_id,endpoint_id,reporter,evidence_hash,chain_timestamp)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(transaction_hash,log_index) DO NOTHING`,
    [tx, logIndex, block.toString(), event.eventName, event.incidentId.toString(), event.endpointId, event.reporter, event.hash, new Date(Number(event.timestamp) * 1000)]);
}
async function receiptOrNull(clients: Clients, hash: Hex): Promise<TransactionReceipt | null> {
  try { return await clients.publicClient.getTransactionReceipt({ hash }); }
  catch (error) { if (error instanceof TransactionReceiptNotFoundError) return null; throw error; }
}

async function confirmJob(job: Job, receipt: TransactionReceipt, clients: Clients) {
  if (receipt.status !== "success") throw new LedgerFailure("TRANSACTION_REVERTED", true);
  const expectedName = job.kind === "open" ? "IncidentOpened" : "IncidentResolved";
  const matching = receipt.logs.filter(log => log.address.toLowerCase() === clients.config.registry!.toLowerCase())
    .map(log => ({ log, event: decodeRegistryLog(log) })).find(item => item.event?.eventName === expectedName && item.event.hash === job.evidence_hash && item.event.endpointId === job.endpoint_id);
  if (!matching?.event) throw new LedgerFailure("RECEIPT_EVIDENCE_MISMATCH");
  const event = matching.event;
  const record = await clients.publicClient.readContract({ address: clients.config.registry!, abi: registryAbi, functionName: "getIncident", args: [event.incidentId] });
  const authorized = await clients.publicClient.readContract({ address: clients.config.registry!, abi: registryAbi, functionName: "authorizedReporter" });
  if (record.reportKey !== job.report_key || record.endpointId !== job.endpoint_id || record.reporter.toLowerCase() !== authorized.toLowerCase() ||
    (job.kind === "open" ? record.evidenceHash : record.resolutionHash) !== job.evidence_hash) throw new LedgerFailure("CONTRACT_EVIDENCE_MISMATCH");
  await transaction(async client => {
    await retainChainEvent(client, event, receipt.transactionHash, matching.log.logIndex!, receipt.blockNumber);
    await client.query("UPDATE outbox SET state='confirmed',transaction_hash=$2,last_error=NULL WHERE id=$1", [job.id, receipt.transactionHash]);
    if (job.kind === "open") await client.query(`UPDATE incidents SET chain_incident_id=$2,open_tx_hash=$3,reporter=$4,last_error=NULL,
      ledger_status=CASE WHEN recovered_at IS NOT NULL THEN 'resolution_queued' ELSE 'open_confirmed' END WHERE id=$1`, [job.incident_id, event.incidentId.toString(), receipt.transactionHash, record.reporter]);
    else await client.query("UPDATE incidents SET resolve_tx_hash=$2,reporter=$3,ledger_status='resolved',last_error=NULL WHERE id=$1", [job.incident_id, receipt.transactionHash, record.reporter]);
    const at = new Date(Number(event.timestamp) * 1000);
    await timelineEvent(client, job.incident_id, job.kind === "open" ? "opened_onchain" : "resolved_onchain", at,
      job.kind === "open" ? `Incident #${event.incidentId} confirmed on-chain; opening evidence matches` : `Incident #${event.incidentId} resolved on-chain; recovery evidence matches`,
      `${job.id}:confirmed`, receipt.transactionHash);
  });
}

async function retryJob(job: Job, error: unknown) {
  const attempts = job.attempts + 1;
  const code = error instanceof LedgerFailure ? error.code : error instanceof Error && /^REPORT_[A-Z_]+$/.test(error.message) ? error.message : "RPC_OR_TRANSACTION_ERROR";
  const permanent = code.endsWith("EVIDENCE_MISMATCH");
  const exhausted = permanent || attempts >= 8;
  const delay = Math.min(300000, 5000 * 2 ** Math.min(attempts, 8));
  await transaction(async client => {
    await client.query(`UPDATE outbox SET attempts=$2,state=$3,last_error=$4,next_attempt_at=$5,
      raw_transaction=CASE WHEN $6 THEN NULL ELSE raw_transaction END,
      transaction_hash=CASE WHEN $6 THEN NULL ELSE transaction_hash END WHERE id=$1`,
      [job.id, attempts, exhausted ? "exhausted" : "queued", code, new Date(Date.now() + delay), error instanceof LedgerFailure && error.reverted]);
    await client.query("UPDATE incidents SET last_error=$2,ledger_status=CASE WHEN $3 THEN 'failed' ELSE ledger_status END WHERE id=$1", [job.incident_id, code, exhausted]);
    await timelineEvent(client, job.incident_id, "transaction_failed", new Date(),
      `${code}; ${exhausted ? "automatic retries stopped" : `retry ${attempts}/8 scheduled`}`, `${job.id}:failure:${attempts}`, job.transaction_hash);
  });
}
async function deferJob(job: Job, ms = 5000) { await pool.query("UPDATE outbox SET next_attempt_at=$2 WHERE id=$1", [job.id, new Date(Date.now() + ms)]); }

async function processJob(job: Job, clients: Clients, assertLock: () => void): Promise<string> {
  const { publicClient, wallet, account, config, chain } = clients;
  if (job.transaction_hash) {
    const receipt = await receiptOrNull(clients, job.transaction_hash);
    if (receipt) { await confirmJob(job, receipt, clients); return "ready"; }
  }
  const chainId = await publicClient.readContract({ address: config.registry!, abi: registryAbi, functionName: "incidentByReport", args: [job.report_key] });
  if (chainId !== 0n) {
    const record = await publicClient.readContract({ address: config.registry!, abi: registryAbi, functionName: "getIncident", args: [chainId] });
    if (record.reportKey !== job.report_key || record.endpointId !== job.endpoint_id) throw new LedgerFailure("CONTRACT_EVIDENCE_MISMATCH");
    const transitionExists = job.kind === "open" || record.status === 1;
    if (transitionExists) {
      const expectedHash = job.kind === "open" ? record.evidenceHash : record.resolutionHash;
      if (expectedHash !== job.evidence_hash) throw new LedgerFailure("CONTRACT_EVIDENCE_MISMATCH");
      const event = (await pool.query<{ transaction_hash: Hex }>("SELECT transaction_hash FROM registry_events WHERE incident_id=$1 AND event_name=$2 AND evidence_hash=$3 LIMIT 1",
        [chainId.toString(), job.kind === "open" ? "IncidentOpened" : "IncidentResolved", expectedHash])).rows[0];
      if (event) {
        const receipt = await receiptOrNull(clients, event.transaction_hash);
        if (receipt) { await confirmJob(job, receipt, clients); return "ready"; }
      }
      await deferJob(job); return "reconciling";
    }
  }
  if (job.kind === "resolve" && chainId === 0n) { await deferJob(job); return "awaiting_open"; }
  if (!account || !wallet) return "signer_missing";
  const data = job.kind === "open" ? encodeFunctionData({ abi: registryAbi, functionName: "openIncident", args: [job.report_key, job.endpoint_id, job.severity, job.evidence_hash] })
    : encodeFunctionData({ abi: registryAbi, functionName: "resolveIncident", args: [chainId, job.evidence_hash] });
  const bounded = config.network === "bot-mainnet" || process.env.PULSEGRID_REPORTING_ENABLED === "true";
  if (bounded) {
    const document = (await pool.query<{ canonical_json: string }>("SELECT canonical_json FROM evidence WHERE hash=$1", [job.evidence_hash])).rows[0];
    if (!document || keccak256(stringToHex(document.canonical_json)) !== job.evidence_hash) throw new LedgerFailure("SOURCE_EVIDENCE_MISMATCH");
    const bundle = evidenceSchema.parse(JSON.parse(document.canonical_json));
    if (bundle.incidentId !== job.incident_id || bundle.reportKey !== job.report_key || bundle.endpointId !== job.endpoint_id || bundle.transition !== job.kind) throw new LedgerFailure("SOURCE_EVIDENCE_MISMATCH");
  }
  if (!job.raw_transaction) {
    const balance = await publicClient.getBalance({ address: account.address });
    if (balance === 0n) { await deferJob(job, 30000); return "waiting_funds"; }
    const prepared = await publicClient.prepareTransactionRequest({ account, chain, to: config.registry!, data });
    assertLock();
    const raw = await wallet.signTransaction(prepared);
    const hash = keccak256(raw);
    const maximumCost = bounded ? reportingTransactionCost(raw, { chainId: config.chainId, registry: config.registry!, data }) : null;
    // Persist signed bytes before broadcasting. Every retry sends these same bytes until a receipt or revert is known.
    await transaction(async client => {
      assertLock();
      if (maximumCost !== null) {
        const reserved = (await client.query<{ reserved: string }>("SELECT COALESCE(sum(detail::numeric),0)::text AS reserved FROM timeline WHERE type='fee_reserved' AND occurred_at>now()-interval '24 hours'")).rows[0].reserved;
        assertDailyReportingBudget(BigInt(reserved), maximumCost);
        await timelineEvent(client, job.incident_id, "fee_reserved", new Date(), maximumCost.toString(), `${job.id}:fee:${hash}`, hash);
      }
      await client.query("UPDATE outbox SET raw_transaction=$2,transaction_hash=$3 WHERE id=$1", [job.id, raw, hash]);
      const column = job.kind === "open" ? "open_tx_hash" : "resolve_tx_hash";
      await client.query(`UPDATE incidents SET ${column}=$2,ledger_status=$3 WHERE id=$1`, [job.incident_id, hash, `${job.kind === "open" ? "open" : "resolution"}_prepared`]);
      await timelineEvent(client, job.incident_id, "prepared", new Date(), "Transaction signed and retained; awaiting RPC submission", `${job.id}:prepared:${hash}`, hash);
    });
    job = { ...job, raw_transaction: raw, transaction_hash: hash };
  }
  if (bounded) {
    reportingTransactionCost(job.raw_transaction!, { chainId: config.chainId, registry: config.registry!, data });
    if (keccak256(job.raw_transaction!) !== job.transaction_hash || (await recoverTransactionAddress({ serializedTransaction: job.raw_transaction! as TransactionSerialized })).toLowerCase() !== account.address.toLowerCase()) throw new LedgerFailure("SIGNED_TRANSACTION_EVIDENCE_MISMATCH");
  }
  assertLock();
  await publicClient.sendRawTransaction({ serializedTransaction: job.raw_transaction! });
  await transaction(async client => {
    await client.query("UPDATE outbox SET state='submitted',last_error=NULL,next_attempt_at=$2 WHERE id=$1", [job.id, new Date(Date.now() + 5000)]);
    await client.query("UPDATE incidents SET ledger_status=$2,last_error=NULL WHERE id=$1", [job.incident_id, job.kind === "open" ? "open_submitted" : "resolution_submitted"]);
    await timelineEvent(client, job.incident_id, job.kind === "open" ? "submitted" : "resolution_submitted", new Date(),
      "RPC accepted the transaction; waiting for a successful receipt", `${job.id}:submitted`, job.transaction_hash);
  });
  const receipt = await receiptOrNull(clients, job.transaction_hash!);
  if (receipt) await confirmJob(job, receipt, clients);
  return "ready";
}

export async function indexRegistry(clients = chainClients()) {
  if (!clients.config.registry) return;
  if (await clients.publicClient.getChainId() !== clients.config.chainId) throw new LedgerFailure("CHAIN_MISMATCH");
  const latest = await clients.publicClient.getBlockNumber();
  const cursor = (await pool.query<{ last_block: string }>("SELECT last_block FROM indexer_state WHERE registry=$1", [clients.config.registry.toLowerCase()])).rows[0];
  let from = cursor ? BigInt(cursor.last_block) + 1n : clients.config.deploymentBlock;
  for (let part = 0; part < 4 && from <= latest; part++) {
    const to = from + 1999n < latest ? from + 1999n : latest;
    const logs = await clients.publicClient.getContractEvents({ address: clients.config.registry, abi: registryAbi, fromBlock: from, toBlock: to });
    for (const hash of new Set(logs.map(log => log.transactionHash).filter((hash): hash is Hex => !!hash))) {
      const receipt = await receiptOrNull(clients, hash);
      if (!receipt || receipt.status !== "success") continue;
      await transaction(async client => {
        for (const log of receipt.logs.filter(log => log.address.toLowerCase() === clients.config.registry!.toLowerCase())) {
          const event = decodeRegistryLog(log);
          if (event) await retainChainEvent(client, event, hash, log.logIndex!, receipt.blockNumber);
        }
      });
    }
    await pool.query("INSERT INTO indexer_state(registry,last_block) VALUES($1,$2) ON CONFLICT(registry) DO UPDATE SET last_block=EXCLUDED.last_block", [clients.config.registry.toLowerCase(), to.toString()]);
    from = to + 1n;
  }
}

export async function ledgerTick(assertLock: () => void = () => undefined): Promise<string> {
  const clients = chainClients();
  if (!clients.config.registry) return "not_deployed";
  if (await clients.publicClient.getChainId() !== clients.config.chainId) return "chain_mismatch";
  await indexRegistry(clients);
  const jobs = (await pool.query<Job>(`SELECT o.*,i.report_key,i.endpoint_id,i.severity,i.chain_incident_id FROM outbox o
    JOIN incidents i ON i.id=o.incident_id WHERE o.state IN ('queued','submitted') AND o.next_attempt_at<=now() ORDER BY o.created_at LIMIT 4`)).rows;
  if (!jobs.length) return "ready";
  if (clients.account) {
    const authorized = await clients.publicClient.readContract({ address: clients.config.registry, abi: registryAbi, functionName: "authorizedReporter" });
    if (authorized.toLowerCase() !== clients.account.address.toLowerCase()) return "reporter_mismatch";
  }
  let state = "ready";
  for (const job of jobs) {
    assertLock();
    try { state = await processJob(job, clients, assertLock); }
    catch (error) { await retryJob(job, error); state = "retrying"; }
  }
  return state;
}

export async function verifyOnChainIncident(incidentId: string) {
  const clients = chainClients();
  if (!clients.config.registry) return { available: false, reason: "Registry not deployed", record: null };
  if (await clients.publicClient.getChainId() !== clients.config.chainId) return { available: false, reason: "RPC chain mismatch", record: null };
  const record = await clients.publicClient.readContract({ address: clients.config.registry, abi: registryAbi, functionName: "getIncident", args: [BigInt(incidentId)] });
  return { available: true, reason: null, record: { ...record, openedAt: record.openedAt.toString(), resolvedAt: record.resolvedAt.toString() } };
}
