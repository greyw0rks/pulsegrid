import { describe, expect, it } from "vitest";
import { decodeAddress, encodeAddress } from "@polkadot/util-crypto";
import { fallbackDestination, fundingAmount, NATIVE_UNIT, validateFunding } from "../src/lib/funding";

const source = "5DkyaZCdhQH848vkZBxp6bPEVcn78bpKf3rhtwRn5tb8VrJv";
const reporter = "0xC156551F786270C8bb3c748c9Bee68FaC1bdC9DB";
const budget = { source, signer: source, free: 500n * NATIVE_UNIT, frozen: 0n, amount: 300n * NATIVE_UNIT, fee: NATIVE_UNIT / 50n, existentialDeposit: NATIVE_UNIT / 10n };

describe("native reporter funding", () => {
  it("retains decimal precision and rejects unbounded amounts", () => {
    expect(fundingAmount("0.00000000000001")).toBe(1n);
    expect(fundingAmount("300")).toBe(300n * NATIVE_UNIT);
    for (const value of ["0", "301", "-1", "1e2", "0.000000000000001", "NaN"]) expect(() => fundingAmount(value)).toThrow();
  });
  it("targets the documented H160 fallback AccountId32", () => {
    expect(Buffer.from(decodeAddress(fallbackDestination(reporter))).toString("hex")).toBe(`${reporter.slice(2).toLowerCase()}${"ee".repeat(12)}`);
    expect(() => fallbackDestination("0x1234")).toThrow();
  });
  it("compares signer identity across SS58 encodings", () => {
    expect(() => validateFunding({ ...budget, signer: encodeAddress(decodeAddress(source), 0) })).not.toThrow();
    expect(() => validateFunding({ ...budget, signer: fallbackDestination(reporter) })).toThrow("does not match");
  });
  it("preserves keep-alive, frozen funds, and a fee margin", () => {
    expect(() => validateFunding(budget)).not.toThrow();
    expect(() => validateFunding({ ...budget, free: budget.amount + budget.fee })).toThrow("keep-alive");
    expect(() => validateFunding({ ...budget, frozen: 250n * NATIVE_UNIT })).toThrow("keep-alive");
  });
});
