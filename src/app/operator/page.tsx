import type { Metadata } from "next";
import { OperatorConsole } from "@/components/operator-console";
import { runtimeConfig } from "@/lib/env";
import { getOverview } from "@/lib/queries";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Operator controls" };

export default async function OperatorPage() {
  const config = runtimeConfig();
  return <div className="page shell"><header className="page-head"><div><h1>Keep the pulse running.</h1>
    <p className="lede">Register an RPC endpoint, tune detection thresholds, and pause or resume observations.</p></div></header>
    {config.scheduledMonitoring && <p className="notice">Hosted checks run every five minutes. Scheduled runs can be delayed; review the last observed time before assessing endpoint health.</p>}
    <OperatorConsole initial={await getOverview()} tokenConfigured={!!config.operatorToken} allowedHosts={config.allowedHosts} scheduledMonitoring={config.scheduledMonitoring} />
  </div>;
}
