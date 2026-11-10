import { beforeEach, describe, expect, it, vi } from "vitest";
import { encodeAbiParameters, encodeEventTopics, encodeFunctionData, keccak256, parseEther, type Address, type Hex } from "viem";
import { buildEvidence, endpointIdFor, reportKeyFor } from "../src/lib/evidence";
import { walletRegistryAbi, walletReporters } from "../src/lib/wallet-registry-abi";
import type { IncidentView, StoredCheck } from "../src/lib/types";

const mocks = vi.hoisted(() => ({ readFile: vi.fn(), getIncident: vi.fn(), getEvidence: vi.fn(), getOverview: vi.fn(),
  rpc: { getChainId: vi.fn(), getCode: vi.fn(), getTransactionReceipt: vi.fn(), readContract: vi.fn(),
    estimateGas: vi.fn(), getGasPrice: vi.fn(), getBalance: vi.fn(), getTransaction: vi.fn() } }));
vi.mock("node:fs/promises", () => ({ readFile: mocks.readFile }));
vi.mock("../src/lib/queries", () => ({ getIncident: mocks.getIncident, getEvidence: mocks.getEvidence, getOverview: mocks.getOverview }));
vi.mock("viem", async original => ({ ...await original<typeof import("viem")>(), createPublicClient: () => mocks.rpc }));
import { getWalletReportOverview, prepareWalletReport, retainedWalletSource, verifyWalletReportReceipt, walletRegistryDeployment } from "../src/lib/wallet-reports";

const registry: Address = "0x1111111111111111111111111111111111111111";
const reporter = walletReporters[1];
const txHash = `0x${"ab".repeat(32)}` as Hex;
const deploymentHash = `0x${"cd".repeat(32)}` as Hex;
const blockHash = `0x${"ef".repeat(32)}` as Hex;
const code: Hex = "0x60006000";
const incidentId = "145e6abe-5a87-469d-ada5-d17b252b0799";
const endpointId = endpointIdFor("retained-drill");
function evidence(success: boolean) {
  const check: StoredCheck = { id: "c7931ef4-2305-4a4d-b5f0-5e282d6ee2d1", endpointId, monitorId: "original-monitor",
    checkedAt: success ? "2026-11-07T16:30:00.000Z" : "2026-11-07T16:00:00.000Z", success, latencyMs: 20,
    chainId: success ? 677 : null, blockHeight: success ? "29447336" : null, genesisHash: null,
    errorCode: success ? null : "RPC_TIMEOUT", warnings: [], methods: ["eth_chainId"], simulated: true };
  return buildEvidence(incidentId, endpointId, success ? "resolve" : "open", [check]);
}
const opening = evidence(false), recovery = evidence(true);
const incident: IncidentView = { id: incidentId, endpointId, endpointName: "Controlled drill", reportKey: reportKeyFor(incidentId),
  severity: 2, failureCode: "RPC_TIMEOUT", failureCount: 1, observedAt: opening.bundle.observedFrom, detectedAt: opening.bundle.observedTo,
  recoveredAt: recovery.bundle.observedTo, ledgerStatus: "confirmed", evidenceHash: opening.hash, resolutionHash: recovery.hash,
  chainIncidentId: "1", openTxHash: null, resolveTxHash: null, reporter: walletReporters[0], simulated: true, lastError: null };
function deployment(reporters: readonly string[] = walletReporters) {
  return { schema: "pulsegrid.wallet-registry-deployment.v1", chainId: 677, registry, owner: walletReporters[0],
    reporters, transactionHash: deploymentHash, blockNumber: "100", runtimeCodeHash: keccak256(code) };
}
let record: { reporter: Address; endpointId: Hex; reportKey: Hex; evidenceHash: Hex; resolutionHash: Hex;
  openedAt: bigint; resolvedAt: bigint; severity: number; status: number };
let receipt: { status: string; to: Address; from: Address; blockNumber: bigint; blockHash: Hex; logs: unknown[] };
let tx: { hash: Hex; chainId: number; blockHash: Hex; from: Address; input: Hex };

function mined(action: "open" | "resolve") {
  record.status = action === "open" ? 0 : 1;
  record.resolutionHash = action === "open" ? `0x${"00".repeat(32)}` : recovery.hash;
  const eventName = action === "open" ? "IncidentOpened" : "IncidentResolved";
  receipt.logs = [{ address: registry, topics: encodeEventTopics({ abi: walletRegistryAbi, eventName,
    args: { incidentId: 1n, endpointId, reporter } }), data: action === "open"
      ? encodeAbiParameters([{ type: "bytes32" }, { type: "uint8" }, { type: "bytes32" }, { type: "uint64" }], [incident.reportKey, 2, opening.hash, 1000n])
      : encodeAbiParameters([{ type: "bytes32" }, { type: "uint64" }], [recovery.hash, 1200n]) }];
  tx.input = action === "open" ? encodeFunctionData({ abi: walletRegistryAbi, functionName: "openIncident", args: [incident.reportKey, endpointId, 2, opening.hash] })
    : encodeFunctionData({ abi: walletRegistryAbi, functionName: "resolveIncident", args: [1n, recovery.hash] });
}

beforeEach(() => {
  vi.resetAllMocks();
  record = { reporter, endpointId, reportKey: incident.reportKey, evidenceHash: opening.hash, resolutionHash: recovery.hash,
    openedAt: 1000n, resolvedAt: 1200n, severity: 2, status: 0 };
  receipt = { status: "success", to: registry, from: reporter, blockNumber: 110n, blockHash, logs: [] };
  tx = { hash: txHash, chainId: 677, blockHash, from: reporter, input: "0x" };
  mocks.readFile.mockResolvedValue(JSON.stringify(deployment()));
  mocks.getIncident.mockResolvedValue({ incident });
  mocks.getEvidence.mockImplementation(async (digest: Hex) => ({ canonical_json: digest === opening.hash ? opening.canonical : recovery.canonical }));
  mocks.getOverview.mockResolvedValue({ databaseAvailable: true, network: { chainId: 677 }, incidents: [incident] });
  mocks.rpc.getChainId.mockResolvedValue(677);
  mocks.rpc.getCode.mockResolvedValue(code);
  mocks.rpc.getTransactionReceipt.mockImplementation(async ({ hash }: { hash: Hex }) => hash === deploymentHash
    ? { status: "success", contractAddress: registry, blockNumber: 100n } : receipt);
  mocks.rpc.getTransaction.mockImplementation(async () => tx);
  mocks.rpc.readContract.mockImplementation(async ({ functionName }: { functionName: string }) => {
    switch (functionName) {
      case "owner": return walletReporters[0];
      case "isReporter": return true;
      case "incidentByReport": return 0n;
      case "incidentCount": return 0n;
      case "getIncident": return record;
      default: throw new Error(`Unexpected read: ${functionName}`);
    }
  });
  mocks.rpc.estimateGas.mockResolvedValue(200000n);
  mocks.rpc.getGasPrice.mockResolvedValue(1000000000n);
  mocks.rpc.getBalance.mockResolvedValue(parseEther("0.025"));
});

describe("wallet report evidence and permissions", () => {
  it("requires every configured participant exactly once in the deployment record", async () => {
    expect((await walletRegistryDeployment())?.reporters).toHaveLength(5);
    for (const reporters of [walletReporters.slice(0, 3), [...walletReporters.slice(1), walletReporters[1]]]) {
      mocks.readFile.mockResolvedValue(JSON.stringify(deployment(reporters)));
      await expect(walletRegistryDeployment()).rejects.toThrow("deployment record");
    }
  });
  it("shows an undeployed registry without requesting a wallet or querying RPC", async () => {
    mocks.readFile.mockRejectedValue(Object.assign(new Error("Missing"), { code: "ENOENT" }));
    expect((await getWalletReportOverview()).state).toBe("not_deployed");
    expect(mocks.rpc.getChainId).not.toHaveBeenCalled();
  });
  it("prepares a zero-value bounded transaction committing the unchanged historical source", async () => {
    const result = await prepareWalletReport({ account: reporter, incidentId, action: "open" });
    expect(result.transaction).toMatchObject({ from: reporter, to: registry, chainId: "0x2a5", value: "0x0",
      data: encodeFunctionData({ abi: walletRegistryAbi, functionName: "openIncident", args: [incident.reportKey, endpointId, 2, opening.hash] }) });
    expect(result.simulated).toBe(true);
    expect(result.sourceObservedAt).toBe(incident.observedAt);
    expect(Number(result.maximumFeeBOT)).toBeLessThan(0.05);
  });
  it("rejects a changed runtime or wrong chain before preparing calldata", async () => {
    mocks.rpc.getCode.mockResolvedValue("0x6001");
    await expect(prepareWalletReport({ account: reporter, incidentId, action: "open" })).rejects.toThrow("verified");
    mocks.rpc.getCode.mockResolvedValue(code); mocks.rpc.getChainId.mockResolvedValue(1);
    await expect(prepareWalletReport({ account: reporter, incidentId, action: "open" })).rejects.toThrow("verified");
  });
  it("rejects unapproved opening and duplicate opening without gas estimation", async () => {
    mocks.rpc.readContract.mockImplementation(async ({ functionName }: { functionName: string }) => functionName === "owner" ? walletReporters[0] : functionName === "incidentByReport" ? 0n : false);
    await expect(prepareWalletReport({ account: reporter, incidentId, action: "open" })).rejects.toThrow("approved");
    mocks.rpc.readContract.mockImplementation(async ({ functionName }: { functionName: string }) => functionName === "owner" ? walletReporters[0] : functionName === "incidentByReport" ? 1n : true);
    await expect(prepareWalletReport({ account: reporter, incidentId, action: "open" })).rejects.toThrow("already attested");
    expect(mocks.rpc.estimateGas).not.toHaveBeenCalled();
  });
  it("requires an existing matching report for recovery, including source severity", async () => {
    await expect(prepareWalletReport({ account: reporter, incidentId, action: "resolve" })).rejects.toThrow("Open this incident");
    mocks.rpc.readContract.mockImplementation(async ({ functionName }: { functionName: string }) => functionName === "owner" ? walletReporters[0] : functionName === "getIncident" ? record : 1n);
    expect((await prepareWalletReport({ account: reporter, incidentId, action: "resolve" })).evidenceHash).toBe(recovery.hash);
    record.severity = 3;
    await expect(prepareWalletReport({ account: reporter, incidentId, action: "resolve" })).rejects.toThrow("does not match");
  });
  it("rejects excessive gas fees or insufficient funds", async () => {
    mocks.rpc.getGasPrice.mockResolvedValue(1000000000000n);
    await expect(prepareWalletReport({ account: reporter, incidentId, action: "open" })).rejects.toThrow("fee exceeds");
    mocks.rpc.getGasPrice.mockResolvedValue(1000000000n); mocks.rpc.getBalance.mockResolvedValue(0n);
    await expect(prepareWalletReport({ account: reporter, incidentId, action: "open" })).rejects.toThrow("needs BOT");
  });
  it("rejects noncanonical, tampered, or incorrectly labelled evidence", async () => {
    mocks.getEvidence.mockResolvedValue({ canonical_json: JSON.stringify(opening.bundle) });
    await expect(retainedWalletSource(incidentId, "open")).rejects.toThrow("failed verification");
    mocks.getEvidence.mockResolvedValue({ canonical_json: recovery.canonical });
    await expect(retainedWalletSource(incidentId, "open")).rejects.toThrow("failed verification");
    mocks.getEvidence.mockResolvedValue({ canonical_json: opening.canonical });
    mocks.getIncident.mockResolvedValue({ incident: { ...incident, simulated: false } });
    await expect(retainedWalletSource(incidentId, "open")).rejects.toThrow("failed verification");
  });
});

describe("wallet report receipt reconciliation", () => {
  it.each(["open", "resolve"] as const)("verifies a mined %s receipt using real ABI logs and original evidence", async action => {
    mined(action);
    expect(await verifyWalletReportReceipt(txHash)).toMatchObject({ state: "confirmed", event: {
      reporter, evidenceHash: action === "open" ? opening.hash : recovery.hash, simulated: true, sourceIncidentId: incidentId } });
  });
  it("retains pending state when no receipt has been mined", async () => {
    mocks.rpc.getTransactionReceipt.mockImplementation(async ({ hash }: { hash: Hex }) => {
      if (hash === deploymentHash) return { status: "success", contractAddress: registry, blockNumber: 100n };
      throw Object.assign(new Error("Not mined"), { name: "TransactionReceiptNotFoundError" });
    });
    expect(await verifyWalletReportReceipt(txHash)).toEqual({ state: "pending" });
  });
  it("reports a genuine reverted core transaction as failed and rejects unrelated reverted transactions", async () => {
    mined("open"); receipt.status = "reverted";
    expect(await verifyWalletReportReceipt(txHash)).toEqual({ state: "failed" });
    receipt.to = reporter;
    await expect(verifyWalletReportReceipt(txHash)).rejects.toThrow("does not target");
  });
  it("excludes permission transactions from core-product receipts", async () => {
    tx.input = encodeFunctionData({ abi: walletRegistryAbi, functionName: "setReporter", args: [reporter, true] });
    await expect(verifyWalletReportReceipt(txHash)).rejects.toThrow("product attestation");
  });
  it("rejects altered calldata, signer, event severity, or receipt block", async () => {
    mined("open"); tx.input = encodeFunctionData({ abi: walletRegistryAbi, functionName: "openIncident", args: [incident.reportKey, endpointId, 3, opening.hash] });
    await expect(verifyWalletReportReceipt(txHash)).rejects.toThrow("did not match");
    mined("open"); tx.from = walletReporters[2];
    await expect(verifyWalletReportReceipt(txHash)).rejects.toThrow("did not match");
    tx.from = reporter; record.severity = 3;
    await expect(verifyWalletReportReceipt(txHash)).rejects.toThrow("did not match");
    record.severity = 2; tx.blockHash = deploymentHash;
    await expect(verifyWalletReportReceipt(txHash)).rejects.toThrow("product attestation");
  });
});
