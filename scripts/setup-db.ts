import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { pool, databaseSchema } from "../src/lib/db";
import { runtimeConfig } from "../src/lib/env";
import { endpointIdFor } from "../src/lib/evidence";

const config = runtimeConfig();
try {
  if (databaseSchema) {
    await pool.query(`CREATE SCHEMA IF NOT EXISTS "${databaseSchema}"`);
    const current = (await pool.query("SELECT current_schema() AS schema")).rows[0]?.schema;
    if (current !== databaseSchema) throw new Error("Refusing database setup outside the configured schema");
  }
  await pool.query(await readFile(new URL("../db/001-initial.sql", import.meta.url), "utf8"));
  const endpoints = [{ id: endpointIdFor("official-evm"), name: config.network === "bot-mainnet" ? "BOT Chain RPC" : "Portaldot EVM", url: config.evmRpc, kind: "evm", chain: config.chainId, genesis: null as string | null }];
  if (config.network === "testnet") endpoints.push({ id: endpointIdFor("official-native"), name: "Portaldot Native", url: config.nativeRpc, kind: "native", chain: null as unknown as number, genesis: config.nativeGenesis || null });
  for (const endpoint of endpoints) {
    await pool.query(`INSERT INTO endpoints(id,name,url,kind,expected_chain_id,expected_genesis_hash)
      VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO NOTHING`, [endpoint.id, endpoint.name, endpoint.url, endpoint.kind, endpoint.chain, endpoint.genesis]);
  }
  if (config.scheduledMonitoring) await pool.query("UPDATE endpoints SET interval_ms=GREATEST(interval_ms,300000)");
  if (config.drillsEnabled) await pool.query(`INSERT INTO endpoints(id,name,url,kind,expected_chain_id,simulated,enabled)
    VALUES($1,'Recovery drill',$2,'evm',$3,true,false) ON CONFLICT(id) DO NOTHING`, [endpointIdFor("controlled-drill"), config.evmRpc, config.chainId]);
  const monitor = await pool.query("SELECT id FROM monitors LIMIT 1");
  if (!monitor.rowCount) await pool.query("INSERT INTO monitors(id,state) VALUES($1,'stopped')", [`monitor-${randomUUID()}`]);
  console.log(JSON.stringify({ event: "database_ready", network: config.networkName, endpoints: endpoints.length, drillsEnabled: config.drillsEnabled }));
} finally { await pool.end(); }
