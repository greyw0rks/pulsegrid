export type WalletReportSource = { id: string; name: string; reportKey: `0x${string}`; endpointId: `0x${string}`; severity: number;
  openingEvidence: `0x${string}`; recoveryEvidence: `0x${string}` | null; simulated: boolean; observedAt: string; recoveredAt: string | null };
export type WalletReportRecord = { id: string; reporter: string; reportKey: string; endpointId: string; status: number;
  openingEvidence: string; recoveryEvidence: string; openedAt: string; resolvedAt: string };
export type WalletReportEvent = { transactionHash: string; reporter: string; action: "openIncident" | "resolveIncident";
  incidentId: string; evidenceHash: string; blockNumber: string; simulated: boolean; sourceIncidentId: string };
export type WalletReportOverview = { state: "ready" | "not_deployed" | "unavailable"; reason: string; registry: string | null;
  reporters: { address: string; enabled: boolean }[]; sources: WalletReportSource[]; records: WalletReportRecord[];
  events: WalletReportEvent[]; eventsAvailable: boolean; completeEventHistory: boolean; chainIncidentCount: string; checkedAt: string };
