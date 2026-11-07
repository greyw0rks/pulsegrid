"use node";
import { internalActionGeneric as internalAction } from "convex/server";

export const run = internalAction({
  args: {},
  handler: async () => {
    const endpoint = process.env.PULSEGRID_MONITOR_URL || "https://pulsegrid-psi.vercel.app/bot/api/monitor";
    const secret = process.env.PULSEGRID_MONITOR_SECRET;
    const url = new URL(endpoint);
    if (url.origin !== "https://pulsegrid-psi.vercel.app" || url.pathname !== "/bot/api/monitor" || !secret) throw new Error("Pulsegrid monitor configuration is incomplete");
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(55000)
    });
    if (!response.ok) throw new Error(`Pulsegrid monitoring returned HTTP ${response.status}`);
    const result = await response.json() as { state?: string; checked?: number; at?: string };
    if (typeof result.state !== "string") throw new Error("Pulsegrid monitoring returned an invalid result");
    console.log("BOT monitoring cycle", JSON.stringify(result));
    return result;
  }
});
