import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createPublicClient, decodeFunctionData, encodeFunctionData, formatEther, http, keccak256, parseEther, parseEventLogs, stringToHex, toHex, toFunctionSelector, type Address, type Hex } from "viem";
import { z } from "zod";
import { canonicalize, evidenceSchema } from "./evidence";
import { getEvidence, getIncident, getOverview } from "./queries";
import { botChain, walletRegistryAbi, walletReporters } from "./wallet-registry-abi";
import type { WalletReportEvent, WalletReportOverview, WalletReportSource } from "./wallet-report-types";

const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
const hash = z.string().regex(/^0x[0-9a-fA-F]{64}$/);
const deploymentSchema = z.object({ schema: z.literal("pulsegrid.wallet-registry-deployment.v1"), chainId: z.literal(677),
  registry: address, owner: address, reporters: z.array(address), transactionHash: hash, blockNumber: z.string(), runtimeCodeHash: hash });
export class WalletReportError extends Error {}
const client = createPublicClient({ chain: botChain, transport: http(botChain.rpcUrls.default.http[0], { timeout: 15000, retryCount: 1 }) });

export async function walletRegistryDeployment() {
  try {
    const file = resolve(/* turbopackIgnore: true */ "docs/evidence/wallet-registry-deployment-677.json");
    const record = deploymentSchema.parse(JSON.parse(await readFile(/* turbopackIgnore: true */ file, "utf8")));
    const actual = new Set(record.reporters.map(reporter => reporter.toLowerCase()));
    if (record.owner.toLowerCase() !== walletReporters[0].toLowerCase() || record.reporters.length !== walletReporters.length || actual.size !== walletReporters.length || walletReporters.some(reporter => !actual.has(reporter.toLowerCase()))) throw new Error("Deployment identity mismatch");
    return record;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new WalletReportError("Wallet registry deployment record is unavailable.");
  }
}
async function verifiedRegistry() {
  const deployment = await walletRegistryDeployment();
  if (!deployment) throw new WalletReportError("Wallet reporting registry has not been deployed.");
  const registry = deployment.registry as Address;
  const [chainId, code, owner, receipt] = await Promise.all([client.getChainId(), client.getCode({ address: registry }),
    client.readContract({ address: registry, abi: walletRegistryAbi, functionName: "owner" }), client.getTransactionReceipt({ hash: deployment.transactionHash as Hex })]);
  if (chainId !== 677 || !code || keccak256(code) !== deployment.runtimeCodeHash || owner.toLowerCase() !== deployment.owner.toLowerCase() || receipt.status !== "success" || receipt.contractAddress?.toLowerCase() !== registry.toLowerCase() || receipt.blockNumber.toString() !== deployment.blockNumber) throw new WalletReportError("Wallet registry could not be verified against BOT Chain.");
  return { registry, deployment };
}
export async function retainedWalletSource(incidentId: string, action: "open" | "resolve") {
  const source = await getIncident(incidentId);
  if (!source) throw new WalletReportError("Retained incident was not found.");
  const incident = source.incident;
  const digest = action === "open" ? incident.evidenceHash : incident.resolutionHash;
  if (!digest) throw new WalletReportError("Recovery evidence is not yet available.");
  const document = await getEvidence(digest);
  if (!document) throw new WalletReportError("The original evidence document is unavailable.");
  const bundle = evidenceSchema.parse(JSON.parse(document.canonical_json));
  if (canonicalize(bundle) !== document.canonical_json || keccak256(stringToHex(document.canonical_json)) !== digest || bundle.incidentId !== incident.id || bundle.reportKey !== incident.reportKey || bundle.endpointId !== incident.endpointId || bundle.transition !== action || bundle.simulated !== incident.simulated || bundle.simulated !== bundle.checks.some(check => check.simulated) || !bundle.checks.every(check => action === "open" ? !check.success : check.success)) throw new WalletReportError("Original source evidence failed verification.");
  return { incident, bundle, digest };
}
export async function prepareWalletReport(input: { account: Address; incidentId: string; action: "open" | "resolve" }) {
  const { registry } = await verifiedRegistry();
  const { incident, digest } = await retainedWalletSource(input.incidentId, input.action);
  const existing = await client.readContract({ address: registry, abi: walletRegistryAbi, functionName: "incidentByReport", args: [input.account, incident.reportKey] });
  let data: Hex;
  if (input.action === "open") {
    if (!await client.readContract({ address: registry, abi: walletRegistryAbi, functionName: "isReporter", args: [input.account] })) throw new WalletReportError("This wallet is not an approved reporter.");
    if (existing !== 0n) throw new WalletReportError("This wallet has already attested this incident. Inspect the existing record.");
    data = encodeFunctionData({ abi: walletRegistryAbi, functionName: "openIncident", args: [incident.reportKey, incident.endpointId, incident.severity, digest] });
  } else {
    if (existing === 0n) throw new WalletReportError("Open this incident from the connected wallet before attesting its recovery.");
    const record = await client.readContract({ address: registry, abi: walletRegistryAbi, functionName: "getIncident", args: [existing] });
    if (record.reporter.toLowerCase() !== input.account.toLowerCase() || record.status !== 0 || record.evidenceHash !== incident.evidenceHash || record.endpointId !== incident.endpointId || record.reportKey !== incident.reportKey || record.severity !== incident.severity) throw new WalletReportError("The wallet report is already resolved or does not match the source.");
    data = encodeFunctionData({ abi: walletRegistryAbi, functionName: "resolveIncident", args: [existing, digest] });
  }
  const estimated = await client.estimateGas({ account: input.account, to: registry, data });
  const gas = estimated * 115n / 100n;
  const gasPrice = await client.getGasPrice();
  const maximumCost = gas * gasPrice;
  if (maximumCost > parseEther("0.05")) throw new WalletReportError("Estimated maximum fee exceeds the 0.05 BOT reporting limit.");
  if (await client.getBalance({ address: input.account }) <= maximumCost) throw new WalletReportError("The connected wallet needs BOT for its transaction fee.");
  return { transaction: { from: input.account, to: registry, data, value: "0x0", chainId: "0x2a5", gas: toHex(gas), gasPrice: toHex(gasPrice) },
    maximumFeeBOT: formatEther(maximumCost), evidenceHash: digest, simulated: incident.simulated, sourceIncidentId: incident.id,
    sourceObservedAt: incident.observedAt, action: input.action };
}

export async function verifyWalletReportReceipt(transactionHash: Hex): Promise<{ state: "pending" | "failed" | "confirmed"; event?: WalletReportEvent }> {
  const { registry } = await verifiedRegistry();
  const receipt = await client.getTransactionReceipt({ hash: transactionHash }).catch(error => {
    if (error.name === "TransactionReceiptNotFoundError") return null;
    throw error;
  });
  if (!receipt) return { state: "pending" };
  if (receipt.to?.toLowerCase() !== registry.toLowerCase()) throw new WalletReportError("The transaction does not target the wallet reporting registry.");
  const tx = await client.getTransaction({ hash: transactionHash });
  const decoded = decodeFunctionData({ abi: walletRegistryAbi, data: tx.input });
  if (tx.chainId !== 677 || tx.hash.toLowerCase() !== transactionHash.toLowerCase() || tx.blockHash !== receipt.blockHash || !["openIncident", "resolveIncident"].includes(decoded.functionName)) throw new WalletReportError("The transaction is not a BOT Chain product attestation.");
  if (receipt.status !== "success") return { state: "failed" };
  const events = parseEventLogs({ abi: walletRegistryAbi, logs: receipt.logs, strict: true }).filter(event => event.address.toLowerCase() === registry.toLowerCase() && (event.eventName === "IncidentOpened" || event.eventName === "IncidentResolved"));
  if (events.length !== 1) throw new WalletReportError("A single matching report event is required.");
  const event = events[0];
  if (event.eventName === "ReporterPermission") throw new WalletReportError("Permission changes do not count as product reports.");
  const record = await client.readContract({ address: registry, abi: walletRegistryAbi, functionName: "getIncident", args: [event.args.incidentId] });
  const digest = event.eventName === "IncidentOpened" ? event.args.evidenceHash : event.args.resolutionHash;
  const document = await getEvidence(digest);
  if (!document) throw new WalletReportError("The attestation's source evidence is unavailable.");
  const bundle = evidenceSchema.parse(JSON.parse(document.canonical_json));
  const action = event.eventName === "IncidentOpened" ? "open" : "resolve";
  const source = await retainedWalletSource(bundle.incidentId, action);
  const expectedData = action === "open" ? encodeFunctionData({ abi: walletRegistryAbi, functionName: "openIncident", args: [source.incident.reportKey, source.incident.endpointId, source.incident.severity, source.digest] })
    : encodeFunctionData({ abi: walletRegistryAbi, functionName: "resolveIncident", args: [event.args.incidentId, record.resolutionHash] });
  const transitionMatches = event.eventName === "IncidentOpened"
    ? record.evidenceHash === digest && record.openedAt === event.args.openedAt && record.reportKey === event.args.reportKey && record.severity === event.args.severity
    : record.status === 1 && record.resolutionHash === digest && record.resolvedAt === event.args.resolvedAt;
  if (source.digest !== digest || tx.input !== expectedData || receipt.from.toLowerCase() !== record.reporter.toLowerCase() || tx.from.toLowerCase() !== record.reporter.toLowerCase() || event.args.reporter.toLowerCase() !== record.reporter.toLowerCase() || event.args.endpointId !== record.endpointId || record.endpointId !== bundle.endpointId || record.reportKey !== bundle.reportKey || record.evidenceHash !== source.incident.evidenceHash || record.severity !== source.incident.severity || !transitionMatches) throw new WalletReportError("Receipt, signing wallet, contract state, and retained evidence did not match.");
  return { state: "confirmed", event: { transactionHash, reporter: record.reporter, action: decoded.functionName as "openIncident" | "resolveIncident",
    incidentId: event.args.incidentId.toString(), evidenceHash: digest, blockNumber: receipt.blockNumber.toString(), simulated: bundle.simulated, sourceIncidentId: bundle.incidentId } };
}
export async function getWalletReportOverview(): Promise<WalletReportOverview> {
  const base: WalletReportOverview = { state: "not_deployed", reason: "Wallet reporting registry is being prepared.", registry: null, reporters: [], sources: [], records: [], events: [], eventsAvailable: false, completeEventHistory: false, chainIncidentCount: "0", checkedAt: new Date().toISOString() };
  try {
    if (!await walletRegistryDeployment()) return base;
    const { registry } = await verifiedRegistry();
    const [overview, count, permissions] = await Promise.all([getOverview(), client.readContract({ address: registry, abi: walletRegistryAbi, functionName: "incidentCount" }),
      Promise.all(walletReporters.map(async address => ({ address, enabled: await client.readContract({ address: registry, abi: walletRegistryAbi, functionName: "isReporter", args: [address] }) })))]);
    if (!overview.databaseAvailable || overview.network.chainId !== 677) throw new WalletReportError("BOT Chain source observations are unavailable.");
    const sources: WalletReportSource[] = overview.incidents.map(incident => ({ id: incident.id, name: incident.endpointName, reportKey: incident.reportKey,
      endpointId: incident.endpointId, severity: incident.severity, openingEvidence: incident.evidenceHash, recoveryEvidence: incident.resolutionHash,
      simulated: incident.simulated, observedAt: incident.observedAt, recoveredAt: incident.recoveredAt }));
    const ids = Array.from({ length: Number(count > 50n ? 50n : count) }, (_, i) => count - BigInt(i));
    const records = await Promise.all(ids.map(async id => {
      const record = await client.readContract({ address: registry, abi: walletRegistryAbi, functionName: "getIncident", args: [id] });
      return { id: id.toString(), reporter: record.reporter, reportKey: record.reportKey, endpointId: record.endpointId, status: record.status,
        openingEvidence: record.evidenceHash, recoveryEvidence: record.resolutionHash, openedAt: record.openedAt.toString(), resolvedAt: record.resolvedAt.toString() };
    }));
    Object.assign(base, { state: "ready", reason: "Contract, owner, runtime code, and successful deployment receipt verified on BOT Chain.", registry, reporters: permissions, sources, records, chainIncidentCount: count.toString() });
    if (count === 0n) return { ...base, eventsAvailable: true, completeEventHistory: true };
    try {
      const response = await fetch(`https://scan.botchain.ai/api/v2/addresses/${registry}/transactions`, { signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw new Error("Explorer unavailable");
      const page = await response.json() as { items: { hash: Hex; method: string; result: string; raw_input?: string }[]; next_page_params: unknown };
      const selectors = [toFunctionSelector("openIncident(bytes32,bytes32,uint8,bytes32)"), toFunctionSelector("resolveIncident(uint256,bytes32)")];
      const candidates = page.items.filter(tx => tx.result === "success" && (["openIncident", "resolveIncident", ...selectors].includes(tx.method) || selectors.includes(tx.raw_input?.slice(0, 10) as Hex)));
      const verified = await Promise.all(candidates.map(tx => verifyWalletReportReceipt(tx.hash)));
      base.events = verified.flatMap(result => result.event ? [result.event] : []);
      base.eventsAvailable = true;
      base.completeEventHistory = page.next_page_params == null;
    } catch { base.reason += " Recent transaction links are temporarily unavailable; contract records remain readable."; }
    return base;
  } catch (error) {
    return { ...base, state: "unavailable", reason: error instanceof WalletReportError ? error.message : "Wallet registry or retained source evidence is temporarily unavailable." };
  }
}
