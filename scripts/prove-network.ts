import { mkdir, writeFile } from "node:fs/promises";
import { createPublicClient, http } from "viem";
import { runtimeConfig } from "../src/lib/env";
import { endpointIdFor } from "../src/lib/evidence";
import { probeEndpoint } from "../src/lib/probe";

const config = runtimeConfig();
const [evm, native] = await Promise.all([
  probeEndpoint({ id: endpointIdFor("official-evm"), url: config.evmRpc, kind: "evm", expectedChainId: config.chainId, expectedGenesisHash: null, timeoutMs: 15000, simulated: false, faultMode: "normal" }),
  config.network === "testnet" ? probeEndpoint({ id: endpointIdFor("official-native"), url: config.nativeRpc, kind: "native", expectedChainId: null, expectedGenesisHash: null, timeoutMs: 15000, simulated: false, faultMode: "normal" }) : null
]);
const client = createPublicClient({ transport: http(config.evmRpc, { timeout: 15000, retryCount: 0 }) });
const latest = evm.success ? await client.getBlock() : null;
const proof = {
  checkedAt: new Date().toISOString(), network: config.networkName,
  expectedChainId: config.chainId, expectedHex: `0x${config.chainId.toString(16)}`,
  evm: { url: config.evmRpc, ...evm, latestBlockHash: latest?.hash ?? null, latestBlockTimestamp: latest ? new Date(Number(latest.timestamp) * 1000).toISOString() : null },
  native: native ? { url: config.nativeRpc, ...native } : null,
  transactionExecutionVerified: false, contractDeploymentVerified: false,
  note: "Public RPC reads only. Native block telemetry does not identify or map validators."
};
await mkdir("docs/evidence", { recursive: true });
await writeFile(`docs/evidence/${config.network === "testnet" ? "network-proof" : "local-network-proof"}.json`, `${JSON.stringify(proof, null, 2)}\n`);
console.log(JSON.stringify(proof, null, 2));
if (!evm.success) process.exitCode = 1;
