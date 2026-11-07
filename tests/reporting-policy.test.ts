import { afterEach, describe, expect, it, vi } from "vitest";
import { parseEther, serializeTransaction, type Hex } from "viem";
import { assertDailyReportingBudget, reportingBudgets, reportingTransactionCost } from "../src/lib/reporting-policy";

const registry = "0x368d564dd8166d1967f21c7fbaaf87883ef85c83" as Hex;
const expected = { chainId: 677, registry, data: "0x1234" as Hex };
const tx = { chainId: 677, to: registry, data: expected.data, gas: 300000n, gasPrice: 20000000000n, value: 0n, nonce: 0, type: "legacy" as const };
afterEach(() => vi.unstubAllEnvs());

describe("bounded reporting transactions", () => {
  it("accepts a zero-value contract call within the fee budget", () => {
    expect(reportingTransactionCost(serializeTransaction(tx), expected)).toBe(parseEther("0.006"));
  });
  it("rejects another chain, target, calldata, or a native-token transfer", () => {
    for (const changed of [{ chainId: 1 }, { to: "0x0000000000000000000000000000000000000001" as Hex }, { data: "0x5678" as Hex }, { value: 1n }]) {
      expect(() => reportingTransactionCost(serializeTransaction({ ...tx, ...changed }), expected)).toThrow("MISMATCH");
    }
  });
  it("rejects excessive legacy and EIP-1559 maximum fees", () => {
    expect(() => reportingTransactionCost(serializeTransaction({ ...tx, gasPrice: 1000000000000n }), expected)).toThrow("BUDGET_EXCEEDED");
    expect(() => reportingTransactionCost(serializeTransaction({ chainId: 677, to: registry, data: expected.data, nonce: 0, gas: tx.gas, maxFeePerGas: 1000000000000n, maxPriorityFeePerGas: 1n, type: "eip1559" }), expected)).toThrow("BUDGET_EXCEEDED");
  });
  it("reserves the maximum fee and stops new reports when the daily allowance is exhausted", () => {
    expect(() => assertDailyReportingBudget(parseEther("0.24"), parseEther("0.01"))).not.toThrow();
    expect(() => assertDailyReportingBudget(parseEther("0.24"), parseEther("0.011"))).toThrow("DAILY_BUDGET_EXCEEDED");
  });
  it("rejects invalid budget configuration", () => {
    vi.stubEnv("PULSEGRID_REPORT_MAX_COST", "0");
    expect(reportingBudgets).toThrow("Invalid reporting");
    vi.stubEnv("PULSEGRID_REPORT_MAX_COST", "0.5");
    vi.stubEnv("PULSEGRID_REPORT_DAILY_MAX_COST", "0.1");
    expect(reportingBudgets).toThrow("Invalid reporting");
  });
});
