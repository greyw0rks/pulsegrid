import { defineChain, parseAbi } from "viem";

export const walletReporters = [
  "0xE79bB36b53835f0740BD4a9684F5C84d8fB9b52C",
  "0xBA46d08B9E298E8E70096Fc238Da207139BCCAB7",
  "0xB9e3A2D811729C11F64313F59922Ab37Afa52010",
  "0x0A4Da2520B480A6422aF61c889f16233DFB256B2",
  "0xc61Bbc0CF5694EF410A578A9833f77C173790450"
] as const;
export const botChain = defineChain({ id: 677, name: "BOT Chain mainnet",
  nativeCurrency: { name: "BOT", symbol: "BOT", decimals: 18 }, rpcUrls: { default: { http: ["https://rpc.botchain.ai"] } },
  blockExplorers: { default: { name: "BOTScan", url: "https://scan.botchain.ai" } } });
export const walletRegistryAbi = parseAbi([
  "function owner() view returns (address)", "function isReporter(address) view returns (bool)",
  "function incidentCount() view returns (uint256)",
  "function incidentByReport(address reporter, bytes32 reportKey) view returns (uint256)",
  "function activeIncident(address reporter, bytes32 endpointId) view returns (uint256)",
  "function setReporter(address reporter, bool enabled)",
  "function openIncident(bytes32 reportKey, bytes32 endpointId, uint8 severity, bytes32 evidenceHash) returns (uint256 incidentId)",
  "function resolveIncident(uint256 incidentId, bytes32 resolutionHash)",
  "function getIncident(uint256 incidentId) view returns ((address reporter, bytes32 endpointId, bytes32 reportKey, bytes32 evidenceHash, bytes32 resolutionHash, uint64 openedAt, uint64 resolvedAt, uint8 severity, uint8 status) incident)",
  "event ReporterPermission(address indexed reporter, bool enabled)",
  "event IncidentOpened(uint256 indexed incidentId, bytes32 indexed endpointId, address indexed reporter, bytes32 reportKey, uint8 severity, bytes32 evidenceHash, uint64 openedAt)",
  "event IncidentResolved(uint256 indexed incidentId, bytes32 indexed endpointId, address indexed reporter, bytes32 resolutionHash, uint64 resolvedAt)",
  "error UnauthorizedOwner()", "error UnauthorizedReporter()", "error NotIncidentReporter()",
  "error ReportAlreadyExists(uint256 incidentId)", "error EndpointAlreadyOpen(uint256 incidentId)",
  "error AlreadyResolved()", "error UnknownIncident()", "error ZeroValue()", "error InvalidSeverity()"
]);
