import type { Hex } from "viem";
import type { FailureCode, ProbeEndpoint, ProbeResult } from "./types";

type RpcResponse = { jsonrpc: string; id: number; result?: unknown; error?: unknown };
class ProbeFailure extends Error { constructor(readonly code: FailureCode) { super(code); } }
const quantity = (value: unknown): bigint => {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]+$/.test(value) || value.length > 66) throw new ProbeFailure("RPC_MALFORMED");
  return BigInt(value);
};
function extract(responses: RpcResponse[], id: number): unknown {
  const response = responses.find(item => item && item.id === id);
  if (!response || response.jsonrpc !== "2.0") throw new ProbeFailure("RPC_MALFORMED");
  if (response.error) throw new ProbeFailure("RPC_ERROR");
  return response.result;
}

async function evm(endpoint: ProbeEndpoint, timeoutMs: number) {
  const response = await fetch(endpoint.url, {
    method: "POST", headers: { "Content-Type": "application/json" }, redirect: "error",
    body: JSON.stringify([
      { jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] },
      { jsonrpc: "2.0", id: 2, method: "eth_blockNumber", params: [] }
    ]), signal: AbortSignal.timeout(timeoutMs)
  });
  if (!response.ok) throw new ProbeFailure("RPC_HTTP_ERROR");
  const raw = await response.text();
  if (raw.length > 65536) throw new ProbeFailure("RPC_MALFORMED");
  let payload: unknown;
  try { payload = JSON.parse(raw); } catch { throw new ProbeFailure("RPC_MALFORMED"); }
  if (!Array.isArray(payload)) throw new ProbeFailure("RPC_MALFORMED");
  const value = quantity(extract(payload, 1));
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new ProbeFailure("RPC_MALFORMED");
  const chainId = Number(value);
  if (chainId !== endpoint.expectedChainId) throw new ProbeFailure("CHAIN_MISMATCH");
  return { chainId, blockHeight: quantity(extract(payload, 2)).toString(), genesisHash: null, warnings: [] as string[] };
}

async function native(endpoint: ProbeEndpoint, timeoutMs: number): Promise<{ chainId: null; blockHeight: string; genesisHash: Hex; warnings: string[] }> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(endpoint.url);
    const responses: RpcResponse[] = [];
    let settled = false;
    const finish = (error?: ProbeFailure) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.close();
      if (error) reject(error);
      else {
        try {
          const header = extract(responses, 1) as { number?: unknown };
          const health = extract(responses, 2) as { isSyncing?: unknown };
          const genesis = extract(responses, 3);
          if (!header || typeof header !== "object" || !health || typeof health.isSyncing !== "boolean" || typeof genesis !== "string" || !/^0x[0-9a-f]{64}$/.test(genesis)) throw new ProbeFailure("RPC_MALFORMED");
          if (endpoint.expectedGenesisHash && genesis !== endpoint.expectedGenesisHash) throw new ProbeFailure("GENESIS_MISMATCH");
          resolve({ chainId: null, blockHeight: quantity(header.number).toString(), genesisHash: genesis as Hex,
            warnings: [...(health.isSyncing ? ["NODE_SYNCING"] : []), ...(endpoint.expectedGenesisHash ? [] : ["GENESIS_NOT_PINNED"])] });
        } catch (error) { reject(error); }
      }
    };
    const timer = setTimeout(() => finish(new ProbeFailure("RPC_TIMEOUT")), timeoutMs);
    socket.addEventListener("open", () => {
      for (const [id, method, params] of [[1, "chain_getHeader", []], [2, "system_health", []], [3, "chain_getBlockHash", [0]]] as const) {
        socket.send(JSON.stringify({ jsonrpc: "2.0", id, method, params }));
      }
    });
    socket.addEventListener("message", event => {
      try {
        if (typeof event.data !== "string" || event.data.length > 65536) throw new ProbeFailure("RPC_MALFORMED");
        const item = JSON.parse(event.data) as RpcResponse;
        if ([1, 2, 3].includes(item.id) && !responses.some(r => r.id === item.id)) responses.push(item);
        if (responses.length === 3) finish();
      } catch { finish(new ProbeFailure("RPC_MALFORMED")); }
    });
    socket.addEventListener("error", () => finish(new ProbeFailure("WS_CONNECTION")));
    socket.addEventListener("close", () => { if (!settled) finish(new ProbeFailure("WS_CONNECTION")); });
  });
}

export async function probeEndpoint(endpoint: ProbeEndpoint): Promise<ProbeResult> {
  const checkedAt = new Date().toISOString();
  const started = performance.now();
  const methods = endpoint.kind === "evm" ? ["eth_chainId", "eth_blockNumber"] : ["chain_getHeader", "system_health", "chain_getBlockHash"];
  const base = { checkedAt, methods, simulated: endpoint.simulated };
  if (endpoint.simulated && endpoint.faultMode === "timeout") {
    return { ...base, success: false, latencyMs: 0, chainId: null, blockHeight: null, genesisHash: null, errorCode: "DRILL_TIMEOUT", warnings: [] };
  }
  try {
    const result = await (endpoint.kind === "evm" ? evm(endpoint, endpoint.timeoutMs) : native(endpoint, endpoint.timeoutMs));
    return { ...base, ...result, success: true, latencyMs: Math.round(performance.now() - started), errorCode: null };
  } catch (error) {
    const code = error instanceof ProbeFailure ? error.code : error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name) ? "RPC_TIMEOUT" : "RPC_ERROR";
    return { ...base, success: false, latencyMs: Math.round(performance.now() - started), chainId: null, blockHeight: null, genesisHash: null, errorCode: code, warnings: [] };
  }
}
