import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pool } from "../src/lib/db";
import { canonicalize, evidenceDigest, evidenceSchema } from "../src/lib/evidence";

const target = process.argv[2];
if (!target) throw new Error("Usage: pnpm verify:evidence <0x-digest|path-to-json>");

let bundle: unknown;
let expectedHash: string | undefined;
let storedCanonical: string | undefined;
let usedDatabase = false;

if (/^0x[0-9a-f]{64}$/.test(target)) {
  usedDatabase = true;
  const row = (await pool.query<{ hash: string; canonical_json: string; bundle: unknown }>("SELECT hash,canonical_json,bundle FROM evidence WHERE hash=$1", [target])).rows[0];
  if (!row) throw new Error(`Evidence ${target} was not found`);
  bundle = row.bundle;
  expectedHash = row.hash;
  storedCanonical = row.canonical_json;
} else {
  const document = JSON.parse(await readFile(resolve(target), "utf8")) as unknown;
  if (document && typeof document === "object" && "bundle" in document) {
    const wrapper = document as { bundle: unknown; hash?: string; canonical?: string };
    bundle = wrapper.bundle;
    expectedHash = wrapper.hash;
    storedCanonical = wrapper.canonical;
  } else bundle = document;
}

try {
  const parsed = evidenceSchema.parse(bundle);
  const canonical = canonicalize(parsed);
  const digest = evidenceDigest(parsed);
  if (storedCanonical !== undefined && storedCanonical !== canonical) throw new Error("Stored canonical JSON does not match the evidence bundle");
  if (expectedHash !== undefined && expectedHash !== digest.hash) throw new Error(`Digest mismatch: expected ${expectedHash}, computed ${digest.hash}`);
  console.log(JSON.stringify({ event: "evidence_verified", hash: digest.hash, incidentId: parsed.incidentId, transition: parsed.transition, checks: parsed.checks.length }));
} finally {
  if (usedDatabase) await pool.end();
}
