import { decodeAddress, encodeAddress } from "@polkadot/util-crypto";
import { isAddress } from "viem";

export const NATIVE_UNIT = 100_000_000_000_000n;

export function fundingAmount(value: string): bigint {
  if (!/^\d+(?:\.\d{1,14})?$/.test(value)) throw new Error("Use a positive decimal tPOT amount with at most 14 decimal places");
  const [whole, fraction = ""] = value.split(".");
  const amount = BigInt(whole) * NATIVE_UNIT + BigInt(fraction.padEnd(14, "0"));
  if (amount <= 0n || amount > 300n * NATIVE_UNIT) throw new Error("Funding must be greater than zero and at most 300 tPOT per operation");
  return amount;
}

export function fallbackDestination(reporter: string): string {
  if (!isAddress(reporter)) throw new Error("Invalid reporter address");
  return encodeAddress(Buffer.from(`${reporter.slice(2).toLowerCase()}${"ee".repeat(12)}`, "hex"), 42);
}

export function validateFunding(input: { source: string; signer: string; free: bigint; frozen: bigint; amount: bigint; fee: bigint; existentialDeposit: bigint }) {
  if (Buffer.compare(Buffer.from(decodeAddress(input.source)), Buffer.from(decodeAddress(input.signer))) !== 0) throw new Error("Wallet does not match the funded public account");
  if (input.amount <= 0n || input.amount > 300n * NATIVE_UNIT || input.fee < 0n || input.existentialDeposit < 0n) throw new Error("Invalid funding budget");
  const reserve = input.frozen > input.existentialDeposit ? input.frozen : input.existentialDeposit;
  if (input.free - input.amount - input.fee * 2n < reserve) throw new Error("Funding would exceed spendable balance or account keep-alive reserve");
}
