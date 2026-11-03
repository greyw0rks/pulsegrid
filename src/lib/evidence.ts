import { keccak256, stringToHex, type Hex } from "viem";
import { z } from "zod";
import type { StoredCheck } from "./types";
import { VERSION } from "./env";

const hash = z.string().regex(/^0x[0-9a-f]{64}$/);
export const evidenceSchema = z.object({
  schema: z.literal("pulsegrid.evidence.v1"),
  incidentId: z.uuid(),
  reportKey: hash,
  endpointId: hash,
  transition: z.enum(["open", "resolve"]),
  source: z.object({ monitorId: z.string().min(1), version: z.string(), kind: z.literal("single-monitor-observation") }).strict(),
  observedFrom: z.iso.datetime(),
  observedTo: z.iso.datetime(),
  simulated: z.boolean(),
  checks: z.array(z.object({
    id: z.uuid(), checkedAt: z.iso.datetime(), success: z.boolean(), latencyMs: z.number().int().nonnegative(),
    chainId: z.number().int().nonnegative().nullable(), blockHeight: z.string().regex(/^\d+$/).nullable(),
    genesisHash: hash.nullable(), errorCode: z.string().nullable(), methods: z.array(z.string()), warnings: z.array(z.string()), simulated: z.boolean()
  }).strict()).min(1).max(64)
}).strict();
export type EvidenceBundle = z.infer<typeof evidenceSchema>;

/** The schema uses safe integers, strings, booleans and null; object keys are sorted recursively. */
export function canonicalize(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) throw new Error("Evidence numbers must be safe integers");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalize(item)}`).join(",")}}`;
  }
  throw new Error("Unsupported value in evidence JSON");
}

export function evidenceDigest(value: unknown): { canonical: string; hash: Hex } {
  const canonical = canonicalize(value);
  return { canonical, hash: keccak256(stringToHex(canonical)) };
}

export function reportKeyFor(incidentId: string): Hex { return keccak256(stringToHex(`pulsegrid:incident:${incidentId}`)); }
export function endpointIdFor(name: string): Hex { return keccak256(stringToHex(`pulsegrid:endpoint:${name}`)); }

export function buildEvidence(incidentId: string, endpointId: Hex, transition: "open" | "resolve", checks: StoredCheck[]) {
  if (!checks.length) throw new Error("Evidence requires observations");
  const sorted = [...checks].sort((a, b) => a.checkedAt.localeCompare(b.checkedAt));
  const bundle = evidenceSchema.parse({
    schema: "pulsegrid.evidence.v1", incidentId, reportKey: reportKeyFor(incidentId), endpointId, transition,
    source: { monitorId: sorted[0].monitorId, version: VERSION, kind: "single-monitor-observation" },
    observedFrom: sorted[0].checkedAt, observedTo: sorted[sorted.length - 1].checkedAt,
    simulated: sorted.some(c => c.simulated),
    checks: sorted.map(({ id, checkedAt, success, latencyMs, chainId, blockHeight, genesisHash, errorCode, methods, warnings, simulated }) =>
      ({ id, checkedAt, success, latencyMs, chainId, blockHeight, genesisHash, errorCode, methods, warnings, simulated }))
  });
  return { bundle, ...evidenceDigest(bundle) };
}
