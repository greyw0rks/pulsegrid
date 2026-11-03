import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/db", () => ({ pool: { query: vi.fn() } }));
import { addEndpoint, assertAllowedEndpoint, authorizeOperator } from "../src/lib/configuration";
import { pool } from "../src/lib/db";

afterEach(() => vi.unstubAllEnvs());

describe("operator authorization", () => {
  function configured() {
    vi.stubEnv("PULSEGRID_OPERATOR_TOKEN", "test-operator-token");
    vi.stubEnv("PULSEGRID_SITE_URL", "http://localhost:3023");
    vi.stubEnv("NODE_ENV", "production");
  }
  it("rejects missing configuration, missing credentials and wrong tokens", () => {
    vi.stubEnv("PULSEGRID_OPERATOR_TOKEN", "");
    expect(authorizeOperator(new Request("http://localhost:3023"))).toBe(false);
    configured();
    expect(authorizeOperator(new Request("http://localhost:3023"))).toBe(false);
    expect(authorizeOperator(new Request("http://localhost:3023", { headers: { authorization: "Bearer incorrect" } }))).toBe(false);
  });
  it("accepts the configured token for the app origin and an authenticated CLI", () => {
    configured();
    expect(authorizeOperator(new Request("http://localhost:3023", { headers: { authorization: "Bearer test-operator-token", origin: "http://localhost:3023" } }))).toBe(true);
    expect(authorizeOperator(new Request("http://localhost:3023", { headers: { authorization: "Bearer test-operator-token" } }))).toBe(true);
  });
  it("rejects a foreign browser origin even with a correct token", () => {
    configured();
    expect(authorizeOperator(new Request("http://localhost:3023", { headers: { authorization: "Bearer test-operator-token", origin: "https://foreign.example" } }))).toBe(false);
  });
});

describe("endpoint allowlist", () => {
  it("rejects intervals faster than hosted scheduling before persisting an endpoint", async () => {
    vi.stubEnv("PULSEGRID_NETWORK", "testnet");
    vi.stubEnv("PULSEGRID_ALLOWED_HOSTS", "rpc.example.test");
    vi.stubEnv("PULSEGRID_SCHEDULED_MONITORING", "true");
    vi.mocked(pool.query).mockClear();
    await expect(addEndpoint({ name: "Official RPC", url: "https://rpc.example.test", kind: "evm", intervalSeconds: 30 })).rejects.toThrow("at least 300 seconds");
    expect(pool.query).not.toHaveBeenCalled();
    await expect(addEndpoint({ name: "Official RPC", url: "https://rpc.example.test", kind: "evm", intervalSeconds: 300 })).resolves.toMatch(/^0x[0-9a-f]{64}$/);
    expect(pool.query).toHaveBeenCalledTimes(1);
  });
  it("rejects credentials, query strings, foreign hosts and unexpected ports", () => {
    vi.stubEnv("PULSEGRID_NETWORK", "testnet");
    vi.stubEnv("PULSEGRID_ALLOWED_HOSTS", "rpc.example.test");
    expect(assertAllowedEndpoint("https://rpc.example.test", "evm").hostname).toBe("rpc.example.test");
    for (const url of ["https://user:secret@rpc.example.test", "https://rpc.example.test?token=value", "https://foreign.example", "https://rpc.example.test:8443", "http://rpc.example.test"]) {
      expect(() => assertAllowedEndpoint(url, "evm")).toThrow();
    }
  });
  it("permits local HTTP only on an explicitly local development network", () => {
    vi.stubEnv("PULSEGRID_NETWORK", "local"); vi.stubEnv("NODE_ENV", "development");
    expect(assertAllowedEndpoint("http://127.0.0.1:18547", "evm").hostname).toBe("127.0.0.1");
    vi.stubEnv("NODE_ENV", "production");
    expect(() => assertAllowedEndpoint("http://127.0.0.1:18547", "evm")).toThrow();
  });
});
