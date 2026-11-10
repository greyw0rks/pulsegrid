import { getWalletReportOverview } from "@/lib/wallet-reports";
import { runtimeConfig } from "@/lib/env";
export const dynamic = "force-dynamic";
export async function GET() {
  if (runtimeConfig().network !== "bot-mainnet") return Response.json({ error: "Use the BOT Chain application for wallet reports." }, { status: 400 });
  const overview = await getWalletReportOverview();
  return Response.json(overview, { headers: { "Cache-Control": "no-store" } });
}
