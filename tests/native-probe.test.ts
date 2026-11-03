import { afterEach, describe, expect, it, vi } from "vitest";
import { probeEndpoint } from "../src/lib/probe";
import type { ProbeEndpoint } from "../src/lib/types";

const genesis = `0x${"a".repeat(64)}` as const;
const endpoint: ProbeEndpoint = { id: `0x${"1".repeat(64)}`, url: "wss://native.example.test", kind: "native",
  expectedChainId: null, expectedGenesisHash: genesis, timeoutMs: 100, simulated: false, faultMode: "normal" };

function socket({ syncing = false, hash = genesis as string, malformed = false } = {}) {
  class MockSocket extends EventTarget {
    constructor() { super(); queueMicrotask(() => this.dispatchEvent(new Event("open"))); }
    send(message: string) {
      const { id } = JSON.parse(message);
      const result = id === 1 ? { number: malformed ? "invalid" : "0x2a" } : id === 2 ? { isSyncing: syncing } : hash;
      queueMicrotask(() => this.dispatchEvent(new MessageEvent("message", { data: JSON.stringify({ jsonrpc: "2.0", id, result }) })));
    }
    close() { /* No transport in this deterministic protocol fixture. */ }
  }
  vi.stubGlobal("WebSocket", MockSocket);
}
afterEach(() => vi.unstubAllGlobals());

describe("native identity and health", () => {
  it("accepts matching genesis and retained block telemetry", async () => {
    socket();
    expect(await probeEndpoint(endpoint)).toMatchObject({ success: true, genesisHash: genesis, blockHeight: "42", warnings: [] });
  });
  it("rejects a different native network", async () => {
    socket({ hash: `0x${"b".repeat(64)}` });
    expect(await probeEndpoint(endpoint)).toMatchObject({ success: false, errorCode: "GENESIS_MISMATCH" });
  });
  it("reports synchronization and an unpinned identity distinctly", async () => {
    socket({ syncing: true });
    expect(await probeEndpoint({ ...endpoint, expectedGenesisHash: null })).toMatchObject({ success: true, warnings: ["NODE_SYNCING", "GENESIS_NOT_PINNED"] });
  });
  it("rejects malformed native headers", async () => {
    socket({ malformed: true });
    expect(await probeEndpoint(endpoint)).toMatchObject({ success: false, errorCode: "RPC_MALFORMED" });
  });
});
