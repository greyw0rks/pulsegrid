import { createPublicClient, createWalletClient, defineChain, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { projectPrivateKey, runtimeConfig } from "./env";

export const registryAbi = parseAbi([
  "function authorizedReporter() view returns (address)",
  "function incidentCount() view returns (uint256)",
  "function incidentByReport(bytes32) view returns (uint256)",
  "function activeIncident(bytes32) view returns (uint256)",
  "function openIncident(bytes32 reportKey, bytes32 endpointId, uint8 severity, bytes32 evidenceHash) returns (uint256 incidentId)",
  "function resolveIncident(uint256 incidentId, bytes32 resolutionHash)",
  "function getIncident(uint256 incidentId) view returns ((address reporter, bytes32 endpointId, bytes32 reportKey, bytes32 evidenceHash, bytes32 resolutionHash, uint64 openedAt, uint64 resolvedAt, uint8 severity, uint8 status) incident)",
  "event IncidentOpened(uint256 indexed incidentId, bytes32 indexed endpointId, address indexed reporter, bytes32 reportKey, uint8 severity, bytes32 evidenceHash, uint64 openedAt)",
  "event IncidentResolved(uint256 indexed incidentId, bytes32 indexed endpointId, address indexed reporter, bytes32 resolutionHash, uint64 resolvedAt)"
]);

export function chainClients() {
  const config = runtimeConfig();
  const chain = defineChain({ id: config.chainId, name: config.networkName,
    nativeCurrency: config.nativeCurrency,
    rpcUrls: { default: { http: [config.evmRpc] } } });
  const transport = http(config.evmRpc, { timeout: 12000, retryCount: 0 });
  const publicClient = createPublicClient({ chain, transport });
  const key = projectPrivateKey();
  const account = key ? privateKeyToAccount(key) : undefined;
  const wallet = account ? createWalletClient({ account, chain, transport }) : undefined;
  return { config, chain, publicClient, account, wallet };
}
