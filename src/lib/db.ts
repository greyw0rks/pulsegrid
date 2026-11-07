import { Pool, type PoolClient } from "pg";
import "./env";

const shared = globalThis as typeof globalThis & { pulsegridPool?: Pool };
export const databaseSchema = process.env.PULSEGRID_DB_SCHEMA || "";
if (databaseSchema && !/^[a-z][a-z0-9_]{0,62}$/.test(databaseSchema)) throw new Error("Invalid Pulsegrid database schema");
export const pool = shared.pulsegridPool ?? new Pool({
  connectionString: process.env.DATABASE_URL || "postgresql://pulsegrid:pulsegrid_local_only@127.0.0.1:5434/pulsegrid",
  max: 6, connectionTimeoutMillis: process.env.PULSEGRID_NETWORK === "bot-mainnet" ? 15000 : 4000, idleTimeoutMillis: 20000, application_name: "pulsegrid",
  ...(databaseSchema ? { options: `-c search_path=${databaseSchema}` } : {})
});
shared.pulsegridPool = pool;
pool.on("error", () => console.error(JSON.stringify({ level: "error", event: "database_connection_lost" })));

export async function transaction<T>(run: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await run(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally { client.release(); }
}
