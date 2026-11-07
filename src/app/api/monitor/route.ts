import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { runtimeConfig } from "@/lib/env";
import { dueEndpoints, endpointForProbe, recordProbe } from "@/lib/store";
import { probeEndpoint } from "@/lib/probe";
import { indexRegistry } from "@/lib/ledger";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const config = runtimeConfig();
  if (config.network !== "bot-mainnet") return NextResponse.json({error:"Unavailable"},{status:404});
  const expected = Buffer.from(process.env.CRON_SECRET || "");
  const actual = Buffer.from(request.headers.get("authorization")?.replace(/^Bearer /, "") || "");
  if (!expected.length || actual.length !== expected.length || !timingSafeEqual(actual,expected)) return NextResponse.json({error:"Unauthorized"},{status:401});
  const lock = await pool.connect();
  let acquired = false;
  try {
    acquired = (await lock.query("SELECT pg_try_advisory_lock($1) AS acquired",[config.chainId])).rows[0].acquired;
    if (!acquired) return NextResponse.json({state:"busy"});
    const monitor = (await pool.query("SELECT id FROM monitors LIMIT 1")).rows[0];
    if (!monitor) throw new Error("Monitor setup incomplete");
    // Allow small differences between the cron's clock and the previous database commit.
    const endpoints = await dueEndpoints(5000);
    for (const endpoint of endpoints) await recordProbe(endpoint.id,await probeEndpoint(endpointForProbe(endpoint)),monitor.id);
    let state = "observing:ready";
    try { await indexRegistry(); } catch { state = "observing:rpc_unavailable"; }
    await pool.query("UPDATE monitors SET heartbeat_at=now(),state=$2,last_error=NULL WHERE id=$1",[monitor.id,state]);
    return NextResponse.json({state,checked:endpoints.length,at:new Date().toISOString()},{headers:{"Cache-Control":"no-store"}});
  } catch {
    return NextResponse.json({error:"Monitoring cycle unavailable"},{status:503});
  } finally {
    if (acquired) await lock.query("SELECT pg_advisory_unlock($1)",[config.chainId]).catch(()=>undefined);
    lock.release();
  }
}
