import { timingSafeEqual, randomUUID } from "node:crypto";
import { z } from "zod";
import { pool } from "./db";
import { runtimeConfig } from "./env";
import { endpointIdFor } from "./evidence";

export const endpointInput = z.object({
  name: z.string().trim().min(2).max(60),
  url: z.url(),
  kind: z.enum(["evm", "native"]),
  intervalSeconds: z.number().int().min(5).max(3600).default(30),
  failureThreshold: z.number().int().min(1).max(10).default(3),
  recoveryThreshold: z.number().int().min(1).max(10).default(3)
}).strict();

export function assertAllowedEndpoint(raw: string, kind: "evm" | "native"): URL {
  const config = runtimeConfig();
  const url = new URL(raw);
  const local = config.network === "local" && process.env.NODE_ENV !== "production" && ["127.0.0.1", "localhost"].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash) throw new Error("Endpoint URLs cannot contain credentials, query strings, or fragments");
  if (kind === "evm" && url.protocol !== "https:" && !(local && url.protocol === "http:")) throw new Error("EVM endpoints require HTTPS");
  if (kind === "native" && url.protocol !== "wss:" && !(local && url.protocol === "ws:")) throw new Error("Native endpoints require WSS");
  if (!local && (!config.allowedHosts.includes(url.hostname.toLowerCase()) || (url.port && url.port !== "443"))) throw new Error("Host is not in the operator's server-side endpoint allowlist");
  return url;
}

export function authorizeOperator(request: Request): boolean {
  const config = runtimeConfig();
  if (!config.operatorToken) return false;
  const provided = request.headers.get("authorization")?.replace(/^Bearer /, "") || "";
  const expected = Buffer.from(config.operatorToken);
  const actual = Buffer.from(provided);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return false;
  const origin = request.headers.get("origin");
  if (origin) {
    const allowed = [new URL(config.siteUrl).origin];
    if (process.env.NODE_ENV !== "production") allowed.push("http://localhost:3000", "http://127.0.0.1:3000");
    if (!allowed.includes(origin)) return false;
  }
  return true;
}

export async function addEndpoint(input: unknown) {
  const data = endpointInput.parse(input);
  const url = assertAllowedEndpoint(data.url, data.kind);
  const config = runtimeConfig();
  const id = endpointIdFor(randomUUID());
  await pool.query(`INSERT INTO endpoints(id,name,url,kind,expected_chain_id,expected_genesis_hash,interval_ms,failure_threshold,recovery_threshold)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [id, data.name, url.toString(), data.kind, data.kind === "evm" ? config.chainId : null,
    data.kind === "native" ? config.nativeGenesis || null : null, data.intervalSeconds * 1000, data.failureThreshold, data.recoveryThreshold]);
  return id;
}

const endpointId = z.string().regex(/^0x[0-9a-f]{64}$/);

export async function setEndpointEnabled(id: string, enabled: boolean) {
  const parsed = endpointId.parse(id);
  const result = await pool.query("UPDATE endpoints SET enabled=$2,next_check_at=now() WHERE id=$1 RETURNING id", [parsed, enabled]);
  return result.rowCount === 1;
}

export async function setDrillFault(id: string, faultMode: "normal" | "timeout") {
  const parsed = endpointId.parse(id);
  const config = runtimeConfig();
  if (!config.drillsEnabled) throw new Error("Controlled drills are disabled");
  const result = await pool.query(
    "UPDATE endpoints SET fault_mode=$2,enabled=true,next_check_at=now() WHERE id=$1 AND simulated RETURNING id",
    [parsed, faultMode]
  );
  return result.rowCount === 1;
}
