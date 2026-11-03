import { spawn, type ChildProcessByStdio } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import type { Readable } from "node:stream";
import { setTimeout as sleep } from "node:timers/promises";
import { Pool } from "pg";
import { createPublicClient, createWalletClient, defineChain, http, type Abi, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { endpointIdFor } from "../src/lib/evidence";
import { checkBrowser } from "./check-browser";
import "../src/lib/env";

const LOCAL_PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as Hex;
const baseDatabaseUrl = process.env.DATABASE_URL || "postgresql://pulsegrid:pulsegrid_local_only@127.0.0.1:5434/pulsegrid";
const schema = `pulsegrid_e2e_${randomBytes(6).toString("hex")}`;
const port = 18_547 + Math.floor(Math.random() * 1000);
const rpcUrl = `http://127.0.0.1:${port}`;
const anvilPath = process.env.FOUNDRY_BIN
  ? join(process.env.FOUNDRY_BIN, "anvil")
  : existsSync(join(homedir(), ".foundry", "bin", "anvil"))
    ? join(homedir(), ".foundry", "bin", "anvil")
    : "anvil";
const account = privateKeyToAccount(LOCAL_PRIVATE_KEY);
const chain = defineChain({
  id: 31337,
  name: "Pulsegrid local integration chain",
  nativeCurrency: { name: "Test Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [rpcUrl] } }
});
const transport = http(rpcUrl, { timeout: 2000, retryCount: 0 });
const publicClient = createPublicClient({ chain, transport });
const walletClient = createWalletClient({ account, chain, transport });
const admin = new Pool({ connectionString: baseDatabaseUrl, max: 1 });
let database: Pool | undefined;
type CapturedChild = ChildProcessByStdio<null, Readable, Readable>;
let anvil: CapturedChild | undefined;
let worker: CapturedChild | undefined;
let web: CapturedChild | undefined;
let anvilLog = "";
let workerLog = "";

function capture(child: CapturedChild, target: "anvil" | "worker") {
  const append = (chunk: Buffer) => {
    if (target === "anvil") anvilLog = `${anvilLog}${chunk.toString()}`.slice(-12_000);
    else workerLog = `${workerLog}${chunk.toString()}`.slice(-12_000);
  };
  child.stdout.on("data", append);
  child.stderr.on("data", append);
}

async function stop(child: CapturedChild | undefined) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  for (let attempt = 0; attempt < 20 && child.exitCode === null; attempt++) await sleep(100);
  if (child.exitCode === null) child.kill("SIGKILL");
}

function startWorker(env: NodeJS.ProcessEnv) {
  const child = spawn(process.execPath, ["--import", "tsx", resolve("worker/main.ts")], {
    cwd: resolve("."), stdio: ["ignore", "pipe", "pipe"] as const, env
  });
  worker = child;
  capture(child, "worker");
  return child;
}

async function waitFor<T>(label: string, read: () => Promise<T | null>, timeoutMs = 30_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    if (worker && worker.exitCode !== null) throw new Error(`Worker exited before ${label}\n${workerLog}`);
    try {
      const result = await read();
      if (result !== null) return result;
    } catch (error) { lastError = error; }
    await sleep(250);
  }
  throw new Error(`Timed out waiting for ${label}${lastError instanceof Error ? `: ${lastError.message}` : ""}`);
}

try {
  await admin.query(`CREATE SCHEMA "${schema}"`);
  const databaseUrl = new URL(baseDatabaseUrl);
  databaseUrl.searchParams.set("options", `-c search_path=${schema}`);
  database = new Pool({ connectionString: databaseUrl.toString(), max: 4 });
  const current = (await database.query<{ current_schema: string }>("SELECT current_schema() AS current_schema")).rows[0]?.current_schema;
  if (current !== schema) throw new Error(`Refusing to run outside temporary schema ${schema}; current schema is ${current}`);
  await database.query(await readFile(new URL("../db/001-initial.sql", import.meta.url), "utf8"));

  const anvilProcess = spawn(anvilPath, ["--host", "127.0.0.1", "--port", String(port), "--chain-id", "31337", "--silent"], {
    cwd: resolve("."), stdio: ["ignore", "pipe", "pipe"] as const
  });
  anvil = anvilProcess;
  capture(anvilProcess, "anvil");
  await waitFor("local Anvil RPC", async () => {
    try { return await publicClient.getChainId() === 31337 ? true : null; } catch { return null; }
  }, 15_000);

  const artifact = JSON.parse(await readFile(resolve("contracts/out/IncidentRegistry.sol/IncidentRegistry.json"), "utf8")) as {
    abi: Abi; bytecode: { object: Hex };
  };
  const deploymentHash = await walletClient.deployContract({ abi: artifact.abi, bytecode: artifact.bytecode.object, args: [account.address] });
  const deployment = await publicClient.waitForTransactionReceipt({ hash: deploymentHash });
  if (deployment.status !== "success" || !deployment.contractAddress) throw new Error("Local registry deployment failed");

  const endpointId = endpointIdFor("controlled-e2e-drill");
  const monitorId = `e2e-monitor-${randomUUID()}`;
  await database.query("INSERT INTO monitors(id,state) VALUES($1,'stopped')", [monitorId]);
  await database.query(`INSERT INTO endpoints(id,name,url,kind,expected_chain_id,interval_ms,timeout_ms,failure_threshold,recovery_threshold,enabled,simulated)
    VALUES($1,'Controlled local recovery drill',$2,'evm',31337,1000,1000,2,2,true,true)`, [endpointId, rpcUrl]);

  const workerEnv = {
    ...process.env,
    NODE_ENV: "test",
    DATABASE_URL: databaseUrl.toString(),
    PULSEGRID_NETWORK: "local",
    PULSEGRID_EVM_RPC: rpcUrl,
    PULSEGRID_REGISTRY_ADDRESS: deployment.contractAddress,
    PULSEGRID_DEPLOYMENT_BLOCK: deployment.blockNumber.toString(),
    PULSEGRID_PRIVATE_KEY: LOCAL_PRIVATE_KEY,
    PULSEGRID_ENABLE_DRILLS: "true",
    PULSEGRID_ALLOWED_HOSTS: "127.0.0.1,test-evm-rpc-v3.portaldot.dev"
  } satisfies NodeJS.ProcessEnv;
  startWorker(workerEnv);

  await waitFor("two baseline observations", async () => {
    const count = Number((await database!.query<{ count: string }>("SELECT count(*) FROM health_checks WHERE endpoint_id=$1 AND success", [endpointId])).rows[0].count);
    return count >= 2 ? count : null;
  });
  await database.query("UPDATE endpoints SET fault_mode='timeout',next_check_at=now() WHERE id=$1", [endpointId]);

  const opened = await waitFor("confirmed incident opening", async () => {
    const row = (await database!.query<{ id: string; ledger_status: string; evidence_hash: Hex; open_tx_hash: Hex | null }>(
      "SELECT id,ledger_status,evidence_hash,open_tx_hash FROM incidents WHERE endpoint_id=$1 ORDER BY detected_at DESC LIMIT 1", [endpointId]
    )).rows[0];
    return row?.ledger_status === "open_confirmed" ? row : null;
  }, 40_000);

  await stop(worker);
  worker = undefined;
  if (!opened.open_tx_hash) throw new Error("Confirmed opening did not retain its transaction hash");
  await database.query("DELETE FROM registry_events WHERE transaction_hash=$1", [opened.open_tx_hash]);
  await database.query(`UPDATE outbox SET state='submitted',attempts=1,next_attempt_at=now()
    WHERE incident_id=$1 AND kind='open'`, [opened.id]);
  await database.query(`UPDATE incidents SET chain_incident_id=NULL,reporter=NULL,ledger_status='open_submitted'
    WHERE id=$1`, [opened.id]);
  const restartedAfter = new Date();
  startWorker(workerEnv);
  await waitFor("worker restart and opening receipt reconciliation", async () => {
    const row = (await database!.query<{ state: string; heartbeat_at: Date; ledger_status: string; event_count: string }>(
      `SELECT m.state,m.heartbeat_at,i.ledger_status,
        (SELECT count(*) FROM registry_events WHERE incident_id='1' AND event_name='IncidentOpened') AS event_count
       FROM monitors m CROSS JOIN incidents i WHERE m.id=$1 AND i.id=$2`, [monitorId, opened.id]
    )).rows[0];
    return row && row.state !== "stopped" && row.heartbeat_at >= restartedAfter && row.ledger_status === "open_confirmed" && row.event_count === "1"
      ? row : null;
  });

  await database.query("UPDATE endpoints SET fault_mode='normal',next_check_at=now() WHERE id=$1", [endpointId]);
  const resolved = await waitFor("confirmed incident recovery", async () => {
    const row = (await database!.query<{ id: string; ledger_status: string; resolution_hash: Hex | null; resolve_tx_hash: Hex | null; recovered_at: Date | null }>(
      "SELECT id,ledger_status,resolution_hash,resolve_tx_hash,recovered_at FROM incidents WHERE id=$1", [opened.id]
    )).rows[0];
    return row?.ledger_status === "resolved" ? row : null;
  }, 40_000);

  const eventCount = Number((await database.query<{ count: string }>("SELECT count(*) FROM registry_events WHERE incident_id='1'")).rows[0].count);
  const evidenceCount = Number((await database.query<{ count: string }>("SELECT count(*) FROM evidence")).rows[0].count);
  const outbox = (await database.query<{ kind: string; state: string; raw_transaction: string | null; transaction_hash: string | null }>(
    "SELECT kind,state,raw_transaction,transaction_hash FROM outbox ORDER BY kind"
  )).rows;
  if (!resolved.recovered_at || !resolved.resolution_hash || resolved.resolution_hash === opened.evidence_hash) throw new Error("Recovery evidence was not retained distinctly");
  if (eventCount !== 2 || evidenceCount !== 2) throw new Error(`Expected two evidence documents and two registry events; received ${evidenceCount} and ${eventCount}`);
  if (outbox.length !== 2 || outbox.some(job => job.state !== "confirmed" || !job.raw_transaction || !job.transaction_hash)) throw new Error("Outbox did not retain both signed, confirmed transitions");

  await stop(worker); worker = undefined;
  const scheduledWorker = spawn(process.execPath, ["--import", "tsx", resolve("worker/main.ts"), "--once"], {
    cwd: resolve("."), stdio: ["ignore", "pipe", "pipe"] as const, env: workerEnv
  });
  capture(scheduledWorker, "worker");
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => { scheduledWorker.kill("SIGTERM"); reject(new Error("Scheduled worker cycle timed out")); }, 30000);
    scheduledWorker.once("error", error => { clearTimeout(timer); reject(error); });
    scheduledWorker.once("exit", code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(`Scheduled worker failed with ${code}`)); });
  });
  const scheduledState = (await database.query<{ state: string }>("SELECT state FROM monitors WHERE id=$1", [monitorId])).rows[0]?.state;
  if (scheduledState !== "observing:ready") throw new Error("A successful scheduled cycle did not retain its observed ready state");
  if (Number((await database.query("SELECT count(*) FROM registry_events")).rows[0].count) !== 2) throw new Error("Scheduled worker duplicated retained registry events");
  const evidenceDirectory = "docs/evidence/local-drill";
  await mkdir(evidenceDirectory, { recursive: true });
  for (const document of (await database.query<{ hash: string; canonical_json: string }>("SELECT hash,canonical_json FROM evidence")).rows) {
    await writeFile(`${evidenceDirectory}/${document.hash}.json`, document.canonical_json);
  }
  let browserVerification: Awaited<ReturnType<typeof checkBrowser>> | null = null;
  if (process.argv.includes("--browser")) {
    const webPort = 30500 + Math.floor(Math.random() * 1000);
    const base = `http://127.0.0.1:${webPort}`;
    const token = randomBytes(32).toString("hex");
    web = spawn(process.execPath, [resolve("node_modules/next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", String(webPort)],
      { cwd: resolve("."), stdio: ["ignore", "pipe", "pipe"] as const, env: { ...workerEnv, NODE_ENV: "production", PULSEGRID_SITE_URL: base, PULSEGRID_OPERATOR_TOKEN: token } });
    web.stdout.on("data", chunk => process.stdout.write(chunk));
    web.stderr.on("data", chunk => process.stderr.write(chunk));
    await waitFor("browser preview", async () => {
      try { return (await fetch(`${base}/api/overview`, { signal: AbortSignal.timeout(2000) })).ok ? true : null; } catch { return null; }
    });
    browserVerification = await checkBrowser(base, token, opened.id, opened.evidence_hash);
  }
  const report = {
    event: "local_e2e_passed",
    checkedAt: new Date().toISOString(),
    network: "Local integration chain",
    simulated: true,
    chainId: 31337,
    registry: deployment.contractAddress,
    deploymentTransaction: deploymentHash,
    incidentId: opened.id,
    openingEvidence: opened.evidence_hash,
    recoveryEvidence: resolved.resolution_hash,
    openingTransaction: opened.open_tx_hash,
    recoveryTransaction: resolved.resolve_tx_hash,
    evidenceDirectory,
    registryEvents: eventCount,
    workerRestarted: true,
    openingReceiptReconciled: true,
    scheduledWorkerCycleVerified: true,
    browserVerification,
    note: "Ephemeral local Anvil and isolated PostgreSQL schema. Browser registration is a configuration fixture with the worker stopped; it is not extra telemetry or public testnet execution."
  };
  await writeFile("docs/evidence/local-e2e.json", `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report));
} catch (error) {
  if (anvilLog) console.error(`Anvil output:\n${anvilLog}`);
  if (workerLog) console.error(`Worker output:\n${workerLog}`);
  throw error;
} finally {
  await stop(web);
  await stop(worker);
  await stop(anvil);
  await database?.end().catch(() => undefined);
  await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`).catch(() => undefined);
  await admin.end().catch(() => undefined);
}
