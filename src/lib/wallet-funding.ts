import { parseEther } from "viem";
export const participantGasTarget = parseEther("0.025");
/** A single recorded grant tops up gas; reruns reconcile that grant instead of replenishing spent funds. */
export function participantFundingShortfall(balance: bigint) {
  if (balance < 0n) throw new Error("A wallet balance cannot be negative.");
  return balance >= participantGasTarget ? 0n : participantGasTarget - balance;
}
