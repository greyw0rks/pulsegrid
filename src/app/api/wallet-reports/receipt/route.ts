import { verifyWalletReportReceipt, WalletReportError } from "@/lib/wallet-reports";
import { runtimeConfig } from "@/lib/env";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  if (runtimeConfig().network !== "bot-mainnet") return Response.json({ error: "Use the BOT Chain application for wallet reports." }, { status: 400 });
  const hash = new URL(request.url).searchParams.get("hash");
  if (!hash || !/^0x[0-9a-fA-F]{64}$/.test(hash)) return Response.json({ error: "Invalid transaction hash." }, { status: 400 });
  try {
    return Response.json(await verifyWalletReportReceipt(hash as `0x${string}`), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof WalletReportError ? error.message : "The receipt could not be verified. Try again shortly." }, { status: error instanceof WalletReportError ? 409 : 503 });
  }
}
