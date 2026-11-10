import { z } from "zod";
import { runtimeConfig } from "@/lib/env";
import { prepareWalletReport, WalletReportError } from "@/lib/wallet-reports";
import type { Address } from "viem";

export const dynamic = "force-dynamic";
const inputSchema = z.object({ account: z.string().regex(/^0x[0-9a-fA-F]{40}$/), incidentId: z.uuid(), action: z.enum(["open", "resolve"]) }).strict();
export async function POST(request: Request) {
  if (runtimeConfig().network !== "bot-mainnet") return Response.json({ error: "Use the BOT Chain application for wallet reports." }, { status: 400 });
  try {
    const input = inputSchema.safeParse(await request.json());
    if (!input.success) return Response.json({ error: "Choose a valid wallet, retained incident, and report action." }, { status: 400 });
    return Response.json(await prepareWalletReport({ ...input.data, account: input.data.account as Address }), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof WalletReportError ? error.message : "Report preparation could not verify the contract or source evidence. Try again shortly." }, { status: error instanceof WalletReportError ? 409 : 503 });
  }
}
