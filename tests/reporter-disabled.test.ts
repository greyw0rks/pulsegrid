import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/db", () => ({ pool: { connect: vi.fn() } }));
vi.mock("../src/lib/ledger", () => ({ ledgerTick: vi.fn() }));
vi.mock("../src/lib/registry", () => ({ chainClients: vi.fn(), registryAbi: [] }));
import { pool } from "../src/lib/db";
import { ledgerTick } from "../src/lib/ledger";
import { chainClients } from "../src/lib/registry";
import { runReporterCycle } from "../src/lib/reporter-cycle";

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllEnvs());

describe("disabled scheduled reporter", () => {
  for (const flag of ["false", "", "0"]) {
    it(`does not connect, load a signer, or process queued transactions when the flag is '${flag}'`, async () => {
      vi.stubEnv("PULSEGRID_REPORTING_ENABLED", flag);
      vi.stubEnv("PULSEGRID_PRIVATE_KEY", "");
      const result = await runReporterCycle();
      expect(result.state).toBe("disabled");
      expect(pool.connect).not.toHaveBeenCalled();
      expect(chainClients).not.toHaveBeenCalled();
      expect(ledgerTick).not.toHaveBeenCalled();
    });
  }
  it("cannot resume signing by changing the flag alone after the production key is removed", async () => {
    vi.stubEnv("PULSEGRID_REPORTING_ENABLED", "true");
    vi.stubEnv("PULSEGRID_NETWORK", "bot-mainnet");
    vi.stubEnv("PULSEGRID_PRIVATE_KEY", "");
    await expect(runReporterCycle()).rejects.toThrow("configuration is incomplete");
    expect(pool.connect).not.toHaveBeenCalled();
    expect(ledgerTick).not.toHaveBeenCalled();
  });
});
