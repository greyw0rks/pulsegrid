import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { BaseError, ContractFunctionRevertedError, createPublicClient, decodeFunctionData, defineChain, formatEther, http, keccak256, parseAbi, parseEventLogs, stringToHex, zeroAddress, type Hex } from "viem";
import { registryAbi } from "../src/lib/registry";
import { canonicalize, evidenceSchema } from "../src/lib/evidence";
import { walletRegistryAbi } from "../src/lib/wallet-registry-abi";
import type { WalletReportOverview } from "../src/lib/wallet-report-types";

// Read-only: no wallet client, private key access, signing, or database mutations.
const base = "https://pulsegrid-psi.vercel.app";
const drill = JSON.parse(await readFile("docs/evidence/bot-drill-0x368d564dd8166d1967f21c7fbaaf87883ef85c83.json", "utf8"));
const registry = drill.registry as Hex;
const client = createPublicClient({
  chain: defineChain({ id: 677, name: "BOT Chain mainnet", nativeCurrency: { name: "BOT", symbol: "BOT", decimals: 18 }, rpcUrls: { default: { http: ["https://rpc.botchain.ai"] } } }),
  transport: http("https://rpc.botchain.ai", { timeout: 20000, retryCount: 1 })
});
const json = async (url: string) => {
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  assert(response.ok, `${url}: HTTP ${response.status}`);
  return response.json();
};
const [chainId, block, code, reporter, record, count, overview, original, proof] = await Promise.all([
  client.getChainId(), client.getBlock(), client.getCode({ address: registry }),
  client.readContract({ address: registry, abi: registryAbi, functionName: "authorizedReporter" }),
  client.readContract({ address: registry, abi: registryAbi, functionName: "getIncident", args: [BigInt(drill.chainIncidentId)] }),
  client.readContract({ address: registry, abi: registryAbi, functionName: "incidentCount" }),
  json(base + "/bot/api/overview"), json(base + "/api/overview"), json(base + "/bot/api/deployment")
]);
assert.equal(chainId, 677);
assert(code && code !== "0x");
assert.equal(reporter.toLowerCase(), drill.reporter.toLowerCase());
assert.equal(record.status, 1);
assert.equal(record.reporter.toLowerCase(), reporter.toLowerCase());
assert.equal(record.endpointId, drill.endpointId);
assert.equal(record.evidenceHash, drill.openingEvidence);
assert.equal(record.resolutionHash, drill.recoveryEvidence);
assert(record.resolvedAt >= record.openedAt);
assert.equal(await client.readContract({ address: registry, abi: registryAbi, functionName: "activeIncident", args: [record.endpointId] }), 0n);
assert.equal(proof.state, "verified");
assert.equal(proof.chainId, 677);
assert.equal(proof.contract.toLowerCase(), registry.toLowerCase());
assert.equal(overview.network.chainId, 677);
assert.equal(overview.ledger.pending, 0);
assert.equal(overview.ledger.failed, 0);
assert(!overview.monitor.stale && overview.databaseAvailable);
const incident = overview.incidents.find((item: { id: string }) => item.id === drill.incidentId);
assert(incident?.simulated && incident.ledgerStatus === "resolved");
assert.equal(incident.openTxHash, drill.openingTransaction);
assert.equal(incident.resolveTxHash, drill.recoveryTransaction);
assert(overview.endpoints.some((item: { simulated: boolean; enabled: boolean; sampleCount: number }) => !item.simulated && item.enabled && item.sampleCount > 0));
assert.equal(original.network.chainId, 420420777);
assert.equal(original.network.registry, "0x9c0d5b9cca49f69ffc7384d5da263689a21f7e22");
assert.equal(original.ledger.confirmed, 2);

const transactions = [];
for (const [transition, hash, evidenceHash, functionName, eventName] of [
  ["open", drill.openingTransaction, drill.openingEvidence, "openIncident", "IncidentOpened"],
  ["resolve", drill.recoveryTransaction, drill.recoveryEvidence, "resolveIncident", "IncidentResolved"]
]) {
  const [transaction, receipt, explorer] = await Promise.all([
    client.getTransaction({ hash }), client.getTransactionReceipt({ hash }), json(`https://scan.botchain.ai/api/v2/transactions/${hash}`)
  ]);
  assert.equal(receipt.status, "success");
  assert.equal(transaction.to?.toLowerCase(), registry.toLowerCase());
  assert.equal(transaction.from.toLowerCase(), reporter.toLowerCase());
  const decoded = decodeFunctionData({ abi: registryAbi, data: transaction.input });
  assert.equal(decoded.functionName, functionName);
  const matchingLogs = parseEventLogs({ abi: registryAbi, logs: receipt.logs, strict: true }).filter(log => log.eventName === eventName && log.address.toLowerCase() === registry.toLowerCase());
  assert.equal(matchingLogs.length, 1);
  const event = matchingLogs[0];
  assert.equal(event.args.incidentId, BigInt(drill.chainIncidentId));
  assert.equal(event.args.endpointId, drill.endpointId);
  assert.equal(event.args.reporter.toLowerCase(), reporter.toLowerCase());
  if (event.eventName === "IncidentOpened") {
    assert.equal(event.args.evidenceHash, evidenceHash);
    assert.equal(event.args.reportKey, record.reportKey);
    assert.equal(event.args.severity, record.severity);
    assert.deepEqual(decoded.args, [record.reportKey, record.endpointId, record.severity, evidenceHash]);
  } else {
    assert.equal(event.args.resolutionHash, evidenceHash);
    assert.deepEqual(decoded.args, [BigInt(drill.chainIncidentId), evidenceHash]);
  }
  assert.equal(explorer.result, "success");
  assert.equal(explorer.method, functionName);
  assert.equal(explorer.block_number, Number(receipt.blockNumber));
  assert.equal(explorer.from.hash.toLowerCase(), reporter.toLowerCase());
  assert.equal(explorer.to.hash.toLowerCase(), registry.toLowerCase());
  const response = await fetch(`${base}/bot/api/evidence/${evidenceHash}`, { signal: AbortSignal.timeout(30000) });
  assert(response.ok);
  const source = await response.text();
  const bundle = evidenceSchema.parse(JSON.parse(source));
  assert.equal(source, canonicalize(bundle));
  assert.equal(keccak256(stringToHex(source)), evidenceHash);
  assert.equal(bundle.transition, transition);
  assert.equal(bundle.incidentId, drill.incidentId);
  assert.equal(bundle.endpointId, record.endpointId);
  assert.equal(bundle.reportKey, record.reportKey);
  assert(bundle.simulated);
  assert(bundle.checks.every(check => transition === "open" ? !check.success : check.success));
  const retainedSource = JSON.parse(await readFile(`docs/evidence/bot-drill/${evidenceHash}.json`, "utf8"));
  assert.equal(canonicalize(retainedSource), source);
  transactions.push({ action: functionName, transactionHash: hash, status: receipt.status, from: transaction.from, to: transaction.to,
    blockNumber: receipt.blockNumber.toString(), blockHash: receipt.blockHash, confirmations: (block.number - receipt.blockNumber).toString(),
    paidFeeBOT: formatEther(receipt.gasUsed * receipt.effectiveGasPrice), evidenceHash, canonicalEvidenceVerified: true, matchingContractStateAndEvent: true,
    explorerVerified: true, explorer: `https://scan.botchain.ai/tx/${hash}`, classification: "controlled mainnet product drill; independent adoption unproved" });
}

const abiWithError = [...registryAbi, ...parseAbi(["error UnauthorizedReporter()"])] as const;
const permissions = [];
for (const functionName of ["openIncident", "resolveIncident"] as const) {
  let rejected = false;
  try {
    if (functionName === "openIncident") await client.simulateContract({ address: registry, abi: abiWithError, account: zeroAddress, functionName, args: [record.reportKey, record.endpointId, record.severity, record.evidenceHash] });
    else await client.simulateContract({ address: registry, abi: abiWithError, account: zeroAddress, functionName, args: [BigInt(drill.chainIncidentId), record.resolutionHash] });
  } catch (error) {
    const revert = error instanceof BaseError ? error.walk(item => item instanceof ContractFunctionRevertedError) : undefined;
    rejected = revert instanceof ContractFunctionRevertedError && revert.data?.errorName === "UnauthorizedReporter";
  }
  assert(rejected, `${functionName} did not reject a non-reporter with UnauthorizedReporter`);
  permissions.push({ functionName, method: "eth_call simulation; no transaction", syntheticCaller: zeroAddress, error: "UnauthorizedReporter" });
}
const sourceResponse = await json(`https://scan.botchain.ai/api/v2/smart-contracts/${registry}`);
assert.equal(sourceResponse.name, "IncidentRegistry");
assert(sourceResponse.source_code.includes("address public immutable authorizedReporter"));
assert(sourceResponse.source_code.includes("external onlyReporter"));
assert.equal(sourceResponse.source_code.trim(), (await readFile("contracts/src/IncidentRegistry.sol", "utf8")).trim());

const walletOverview = await json(base + "/bot/api/wallet-reports") as WalletReportOverview;
assert.equal(walletOverview.state, "ready");
assert(walletOverview.registry && walletOverview.eventsAvailable);
const walletDeployment = JSON.parse(await readFile("docs/evidence/wallet-registry-deployment-677.json", "utf8"));
assert.equal(walletOverview.registry.toLowerCase(), walletDeployment.registry.toLowerCase());
const walletCode = await client.getCode({ address: walletOverview.registry as Hex });
assert(walletCode && keccak256(walletCode) === walletDeployment.runtimeCodeHash);
const walletSource = await json(`https://scan.botchain.ai/api/v2/smart-contracts/${walletOverview.registry}`);
assert(walletSource.is_verified);
assert.equal(walletSource.source_code.trim(), (await readFile("contracts/src/MultiReporterIncidentRegistry.sol", "utf8")).trim());
const participantTransactions = [];
for (const item of walletOverview.events) {
  const hash = item.transactionHash as Hex;
  const [transaction, receipt, explorer] = await Promise.all([
    client.getTransaction({ hash }), client.getTransactionReceipt({ hash }), json(`https://scan.botchain.ai/api/v2/transactions/${hash}`)
  ]);
  assert.equal(receipt.status, "success");
  assert.equal(transaction.chainId, 677);
  assert.equal(transaction.blockHash, receipt.blockHash);
  assert.equal(transaction.value, 0n);
  assert.equal(transaction.to?.toLowerCase(), walletOverview.registry.toLowerCase());
  assert.equal(transaction.from.toLowerCase(), item.reporter.toLowerCase());
  const source = walletOverview.sources.find(source => source.id === item.sourceIncidentId);
  const ownRecord = walletOverview.records.find(record => record.id === item.incidentId && record.reporter.toLowerCase() === item.reporter.toLowerCase());
  assert(source && ownRecord);
  assert.equal(ownRecord.reportKey, source.reportKey);
  assert.equal(ownRecord.endpointId, source.endpointId);
  assert.equal(ownRecord.openingEvidence, source.openingEvidence);
  const isOpening = item.action === "openIncident";
  const expectedDigest = isOpening ? source.openingEvidence : source.recoveryEvidence;
  assert.equal(item.evidenceHash, expectedDigest);
  if (!isOpening) {
    assert.equal(ownRecord.status, 1);
    assert.equal(ownRecord.recoveryEvidence, expectedDigest);
  }
  const decoded = decodeFunctionData({ abi: walletRegistryAbi, data: transaction.input });
  assert.equal(decoded.functionName, item.action);
  assert.deepEqual(decoded.args, isOpening ? [source.reportKey, source.endpointId, source.severity, expectedDigest] : [BigInt(item.incidentId), expectedDigest]);
  const logs = parseEventLogs({ abi: walletRegistryAbi, logs: receipt.logs, strict: true }).filter(log => log.address.toLowerCase() === walletOverview.registry!.toLowerCase() && log.eventName === (isOpening ? "IncidentOpened" : "IncidentResolved"));
  assert.equal(logs.length, 1);
  const event = logs[0];
  assert(event.eventName === "IncidentOpened" || event.eventName === "IncidentResolved");
  assert.equal(event.args.incidentId, BigInt(item.incidentId));
  assert.equal(event.args.reporter.toLowerCase(), item.reporter.toLowerCase());
  assert.equal(event.args.endpointId, source.endpointId);
  if (event.eventName === "IncidentOpened") {
    assert.equal(event.args.evidenceHash, expectedDigest);
    assert.equal(event.args.reportKey, source.reportKey);
    assert.equal(event.args.severity, source.severity);
  } else if (event.eventName === "IncidentResolved") assert.equal(event.args.resolutionHash, expectedDigest);
  assert.equal(explorer.result, "success");
  assert.equal(explorer.method, item.action);
  assert.equal(explorer.block_number, Number(receipt.blockNumber));
  assert.equal(explorer.from.hash.toLowerCase(), item.reporter.toLowerCase());
  assert.equal(explorer.to.hash.toLowerCase(), walletOverview.registry.toLowerCase());
  const evidenceResponse = await fetch(`${base}/bot/api/evidence/${expectedDigest}`, { signal: AbortSignal.timeout(30000) });
  assert(evidenceResponse.ok);
  const canonical = await evidenceResponse.text();
  const bundle = evidenceSchema.parse(JSON.parse(canonical));
  assert.equal(canonical, canonicalize(bundle));
  assert.equal(keccak256(stringToHex(canonical)), expectedDigest);
  assert.equal(bundle.incidentId, source.id);
  assert.equal(bundle.endpointId, source.endpointId);
  assert.equal(bundle.reportKey, source.reportKey);
  assert.equal(bundle.transition, isOpening ? "open" : "resolve");
  assert.equal(bundle.simulated, source.simulated);
  participantTransactions.push({ action: item.action, transactionHash: hash, status: receipt.status, from: transaction.from, to: transaction.to,
    blockNumber: receipt.blockNumber.toString(), blockHash: receipt.blockHash, paidFeeBOT: formatEther(receipt.gasUsed * receipt.effectiveGasPrice),
    evidenceHash: expectedDigest, sourceIncidentId: source.id, sourceObservedAt: source.observedAt, simulated: source.simulated,
    canonicalEvidenceVerified: true, matchingContractStateAndEvent: true, explorerVerified: true, explorer: `https://scan.botchain.ai/tx/${hash}`,
    classification: "wallet-approved attestation of retained source; independence confirmed by owner, not proven on chain" });
}
const allTransactions = [...transactions, ...participantTransactions];
assert.equal(new Set(allTransactions.map(item => item.transactionHash.toLowerCase())).size, allTransactions.length);
const distinctSenderWallets = new Set(allTransactions.map(item => item.from.toLowerCase())).size;
const met = allTransactions.length >= 5 && distinctSenderWallets >= 3;

await mkdir("docs/evidence", { recursive: true });
const checkedAt = new Date().toISOString();
const report = { schema: "pulsegrid.bot-review.v2", checkedAt, readOnly: true, website: base + "/bot", review: base + "/bot/review",
  chainId, currentBlock: block.number.toString(), registry, runtimeCodeHash: keccak256(code), reporter, chainIncidentCount: count.toString(),
  incident: drill.website, contractSourceVerified: true, deploymentVerified: true, monitorHeartbeat: overview.monitor.heartbeatAt,
  originalPortaldotConfirmedEvents: original.ledger.confirmed, transactions, permissions,
  walletReporting: { registry: walletOverview.registry, runtimeCodeHash: keccak256(walletCode), sourceVerified: true,
    chainIncidentCount: walletOverview.chainIncidentCount, completeEventHistory: walletOverview.completeEventHistory, transactions: participantTransactions },
  evidenceRequirement: { minimumSuccessfulCoreTransactions: 5, minimumDistinctWallets: 3, verifiedCoreTransactions: allTransactions.length,
    distinctSenderWallets, met, blocker: met ? null : "Additional successful wallet-approved core attestations are required.",
    note: "Counts exclude deployments, permissions and gas grants. Retained drill attestations do not establish new outages or independent monitoring." } };
await writeFile(`docs/evidence/bot-review-${checkedAt.slice(0, 10)}.json`, JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
