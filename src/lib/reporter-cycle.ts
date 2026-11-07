import { pool } from "./db";
import { runtimeConfig } from "./env";
import { ledgerTick } from "./ledger";
import { chainClients, registryAbi } from "./registry";
import { reportingBudgets } from "./reporting-policy";

/** Only the private scheduled reporter calls this; the public web server has no signer. */
export async function runReporterCycle() {
  const config = runtimeConfig();
  const localTest = config.network === "local" && process.env.NODE_ENV === "test";
  if (process.env.PULSEGRID_REPORTING_ENABLED !== "true") throw new Error("Automatic reporting is disabled");
  if ((!localTest && config.network !== "bot-mainnet") || !config.registry || !process.env.DATABASE_URL || !process.env.PULSEGRID_PRIVATE_KEY) {
    throw new Error("Reporter configuration is incomplete");
  }
  if (!localTest && (config.registry.toLowerCase() !== "0x368d564dd8166d1967f21c7fbaaf87883ef85c83" || config.evmRpc !== "https://rpc.botchain.ai" || process.env.PULSEGRID_DB_SCHEMA !== "pulsegrid_bot_677")) {
    throw new Error("Reporter deployment configuration mismatch");
  }
  reportingBudgets();
  const lock = await pool.connect();
  let acquired = false;
  let lockLost = false;
  const onError = () => { lockLost = true; };
  lock.on("error", onError);
  try {
    acquired = (await lock.query("SELECT pg_try_advisory_lock($1) AS acquired", [config.chainId])).rows[0].acquired;
    if (!acquired) return { state: "busy", at: new Date().toISOString() };
    const { publicClient, account } = chainClients();
    if (!account || await publicClient.getChainId() !== config.chainId) throw new Error("Reporter chain or signer unavailable");
    const authorized = await publicClient.readContract({ address: config.registry, abi: registryAbi, functionName: "authorizedReporter" });
    if (authorized.toLowerCase() !== account.address.toLowerCase()) throw new Error("Reporter wallet is not authorized");
    if (lockLost) throw new Error("Reporter lock connection lost");
    const state = await ledgerTick(() => { if (lockLost) throw new Error("Reporter lock connection lost"); });
    await pool.query("UPDATE monitors SET state=$1 WHERE id=(SELECT id FROM monitors LIMIT 1)", [`observing:${state}`]);
    return { state, reporter: account.address, at: new Date().toISOString() };
  } finally {
    if (acquired && !lockLost) await lock.query("SELECT pg_advisory_unlock($1)", [config.chainId]).catch(() => undefined);
    lock.removeListener("error", onError);
    lock.release(lockLost);
  }
}
