import { describe, expect, it } from "vitest";
import { detect } from "../src/lib/policy";
import type { DetectionState, ProbeResult } from "../src/lib/types";

const policy = { failureThreshold: 3, recoveryThreshold: 2, intervalMs: 30_000 };
const initial: DetectionState = { failures: 0, successes: 0, activeIncidentId: null, lastCheckedAt: null };

function probe(checkedAt: string, success: boolean): ProbeResult {
  return {
    checkedAt,
    success,
    latencyMs: 12,
    chainId: success ? 420420777 : null,
    blockHeight: success ? "123" : null,
    genesisHash: null,
    errorCode: success ? null : "RPC_TIMEOUT",
    warnings: [],
    methods: ["eth_chainId", "eth_blockNumber"],
    simulated: false
  };
}

describe("detect", () => {
  it("opens only after the configured consecutive failure threshold", () => {
    const first = detect(initial, probe("2026-10-28T10:00:00.000Z", false), policy);
    const second = detect(first.state, probe("2026-10-28T10:00:30.000Z", false), policy);
    const third = detect(second.state, probe("2026-10-28T10:01:00.000Z", false), policy);

    expect(first.action).toBeNull();
    expect(second.action).toBeNull();
    expect(third.action).toBe("open");
    expect(third.state.failures).toBe(3);
  });

  it("requires consecutive successes before resolving an active incident", () => {
    const active = { ...initial, failures: 3, activeIncidentId: "incident-1", lastCheckedAt: "2026-10-28T10:00:00.000Z" };
    const first = detect(active, probe("2026-10-28T10:00:30.000Z", true), policy);
    const interrupted = detect(first.state, probe("2026-10-28T10:01:00.000Z", false), policy);
    const recoveryOne = detect(interrupted.state, probe("2026-10-28T10:01:30.000Z", true), policy);
    const recoveryTwo = detect(recoveryOne.state, probe("2026-10-28T10:02:00.000Z", true), policy);

    expect(first.action).toBeNull();
    expect(interrupted.state.successes).toBe(0);
    expect(recoveryOne.action).toBeNull();
    expect(recoveryTwo.action).toBe("resolve");
  });

  it("discards stale partial streaks after a monitoring gap", () => {
    const stale = { ...initial, failures: 2, lastCheckedAt: "2026-10-28T10:00:00.000Z" };
    const next = detect(stale, probe("2026-10-28T10:02:00.000Z", false), policy);

    expect(next.action).toBeNull();
    expect(next.state.failures).toBe(1);
  });
});
