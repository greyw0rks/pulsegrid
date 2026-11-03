import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildEvidence, canonicalize, endpointIdFor, evidenceDigest, reportKeyFor } from "../src/lib/evidence";
import type { StoredCheck } from "../src/lib/types";

function check(id: string, checkedAt: string, success: boolean): StoredCheck {
  return {
    id,
    endpointId: endpointIdFor("official-evm"),
    monitorId: "monitor-1",
    checkedAt,
    success,
    latencyMs: 25,
    chainId: success ? 420420777 : null,
    blockHeight: success ? "42" : null,
    genesisHash: null,
    errorCode: success ? null : "RPC_TIMEOUT",
    warnings: [],
    methods: ["eth_chainId", "eth_blockNumber"],
    simulated: false
  };
}

describe("canonical evidence", () => {
  it("sorts object keys recursively without changing array order", () => {
    expect(canonicalize({ z: 1, a: { y: true, b: [2, 1] } })).toBe('{"a":{"b":[2,1],"y":true},"z":1}');
    expect(evidenceDigest({ b: 2, a: 1 })).toEqual(evidenceDigest({ a: 1, b: 2 }));
  });

  it("rejects values outside the evidence JSON model", () => {
    expect(() => canonicalize(1.5)).toThrow("safe integers");
    expect(() => canonicalize(new Date())).toThrow("Unsupported value");
  });

  it("builds ordered, addressable transition evidence", () => {
    const incidentId = randomUUID();
    const endpointId = endpointIdFor("official-evm");
    const later = check(randomUUID(), "2026-10-28T10:00:30.000Z", false);
    const earlier = check(randomUUID(), "2026-10-28T10:00:00.000Z", false);
    const evidence = buildEvidence(incidentId, endpointId, "open", [later, earlier]);

    expect(evidence.bundle.reportKey).toBe(reportKeyFor(incidentId));
    expect(evidence.bundle.observedFrom).toBe(earlier.checkedAt);
    expect(evidence.bundle.observedTo).toBe(later.checkedAt);
    expect(evidence.bundle.checks.map(item => item.id)).toEqual([earlier.id, later.id]);
    expect(evidence.hash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(evidenceDigest(JSON.parse(evidence.canonical)).hash).toBe(evidence.hash);
  });
});
