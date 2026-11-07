import { afterEach, describe, expect, it, vi } from "vitest";
import { runtimeConfig } from "../src/lib/env";
import { assertAllowedEndpoint } from "../src/lib/configuration";

afterEach(() => vi.unstubAllEnvs());
describe("isolated network deployment", () => {
  it("uses BOT mainnet identity and HTTPS allowlist without Portaldot defaults", () => {
    vi.stubEnv("PULSEGRID_NETWORK", "bot-mainnet");
    vi.stubEnv("PULSEGRID_EVM_RPC", "");
    vi.stubEnv("PULSEGRID_ALLOWED_HOSTS", "");
    const config = runtimeConfig();
    expect(config.chainId).toBe(677);
    expect(config.nativeCurrency.symbol).toBe("BOT");
    expect(config.evmRpc).toBe("https://rpc.botchain.ai");
    expect(assertAllowedEndpoint(config.evmRpc, "evm").hostname).toBe("rpc.botchain.ai");
    expect(() => assertAllowedEndpoint("https://test-evm-rpc-v3.portaldot.dev", "evm")).toThrow();
    expect(() => assertAllowedEndpoint("http://rpc.botchain.ai", "evm")).toThrow();
  });
  it("retains the existing Portaldot testnet identity", () => {
    vi.stubEnv("PULSEGRID_NETWORK", "testnet");
    vi.stubEnv("PULSEGRID_EVM_RPC", "");
    expect(runtimeConfig().chainId).toBe(420420777);
    expect(runtimeConfig().nativeCurrency.symbol).toBe("POT");
    expect(runtimeConfig().evmRpc).toBe("https://test-evm-rpc-v3.portaldot.dev");
  });
});
