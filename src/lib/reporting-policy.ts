import { parseEther, parseTransaction, type Hex } from "viem";

export function reportingBudgets() {
  const perTransaction = parseEther(process.env.PULSEGRID_REPORT_MAX_COST || "0.05");
  const perDay = parseEther(process.env.PULSEGRID_REPORT_DAILY_MAX_COST || "0.25");
  if (perTransaction <= 0n || perDay < perTransaction) throw new Error("Invalid reporting fee budgets");
  return { perTransaction, perDay };
}

export function reportingTransactionCost(raw: Hex, expected: { chainId: number; registry: Hex; data: Hex }) {
  const tx = parseTransaction(raw);
  if (tx.chainId !== expected.chainId || tx.to?.toLowerCase() !== expected.registry.toLowerCase() ||
      tx.data !== expected.data || (tx.value ?? 0n) !== 0n || !tx.gas) throw new Error("REPORT_TRANSACTION_MISMATCH");
  const price = tx.gasPrice ?? tx.maxFeePerGas;
  if (!price || price <= 0n) throw new Error("REPORT_TRANSACTION_FEE_MISSING");
  const cost = tx.gas * price;
  if (cost > reportingBudgets().perTransaction) throw new Error("REPORT_TRANSACTION_BUDGET_EXCEEDED");
  return cost;
}

export function assertDailyReportingBudget(reserved: bigint, nextCost: bigint) {
  if (reserved < 0n || nextCost < 0n || reserved + nextCost > reportingBudgets().perDay) throw new Error("REPORT_DAILY_BUDGET_EXCEEDED");
}
