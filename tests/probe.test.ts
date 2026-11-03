import { afterEach, describe, expect, it, vi } from "vitest";
import { probeEndpoint } from "../src/lib/probe";
import type { ProbeEndpoint } from "../src/lib/types";

const endpoint: ProbeEndpoint = {
  id: `0x${"1".repeat(64)}`,
  url: "https://rpc.example.test",
  kind: "evm",
  expectedChainId: 420420777,
  expectedGenesisHash: null,
  timeoutMs: 1000,
  simulated: false,
  faultMode: "normal"
};

afterEach(() => vi.unstubAllGlobals());

describe("probeEndpoint", () => {
  it("records a controlled timeout without making a network request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await probeEndpoint({ ...endpoint, simulated: true, faultMode: "timeout" });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toMatchObject({ success: false, errorCode: "DRILL_TIMEOUT", simulated: true });
  });

  it("accepts a matching EVM batch response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify([
      { jsonrpc: "2.0", id: 2, result: "0x2a" },
      { jsonrpc: "2.0", id: 1, result: "0x190f1ca9" }
    ]), { status: 200 })));

    const result = await probeEndpoint(endpoint);

    expect(result).toMatchObject({ success: true, chainId: 420420777, blockHeight: "42", errorCode: null });
    expect(result.methods).toEqual(["eth_chainId", "eth_blockNumber"]);
  });

  it("separates chain mismatch from malformed RPC data", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([
        { jsonrpc: "2.0", id: 1, result: "0x1" },
        { jsonrpc: "2.0", id: 2, result: "0x2a" }
      ]), { status: 200 }))
      .mockResolvedValueOnce(new Response("not-json", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    expect(await probeEndpoint(endpoint)).toMatchObject({ success: false, errorCode: "CHAIN_MISMATCH" });
    expect(await probeEndpoint(endpoint)).toMatchObject({ success: false, errorCode: "RPC_MALFORMED" });
  });
});
