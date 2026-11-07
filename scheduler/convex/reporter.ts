"use node";
import { internalActionGeneric as internalAction } from "convex/server";
import { runReporterCycle } from "../../src/lib/reporter-cycle";

export const run = internalAction({
  args: {},
  handler: async () => {
    try {
      const result = await runReporterCycle();
      console.log("BOT reporting cycle", JSON.stringify(result));
      return result;
    } catch {
      // RPC/client errors may contain credentials or serialized transactions. Keep them private.
      throw new Error("BOT reporting cycle unavailable; inspect retained queue status");
    }
  }
});
