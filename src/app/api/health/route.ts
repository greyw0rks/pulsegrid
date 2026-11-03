import { getOverview } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET() {
  const overview = await getOverview();
  const ready = overview.databaseAvailable && !overview.monitor.stale;
  return Response.json({ service: "pulsegrid", ready, databaseAvailable: overview.databaseAvailable,
    workerHealthy: !overview.monitor.stale, workerState: overview.monitor.state,
    network: overview.network.mode, chainId: overview.network.chainId, registryConfigured: !!overview.network.registry,
    checkedAt: overview.generatedAt }, { status: ready ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
