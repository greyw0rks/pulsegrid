import { Pool, type PoolClient } from "pg";
import "./env";

const shared = globalThis as typeof globalThis & { pulsegridPool?: Pool };
export const pool = shared.pulsegridPool ?? new Pool({
  connectionString: process.env.DATABASE_URL || "postgresql://pulsegrid:pulsegrid_local_only@127.0.0.1:5434/pulsegrid",
  max: 6, connectionTimeoutMillis: 4000, idleTimeoutMillis: 20000, application_name: "pulsegrid"
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
