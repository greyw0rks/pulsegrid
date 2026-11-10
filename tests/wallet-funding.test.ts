import { expect, it } from "vitest";
import { parseEther } from "viem";
import { participantFundingShortfall, participantGasTarget } from "../src/lib/wallet-funding";
it("caps each gas grant at 0.025 BOT and transfers only the missing balance", () => {
  expect(participantFundingShortfall(0n)).toBe(participantGasTarget);
  expect(participantFundingShortfall(parseEther("0.01"))).toBe(parseEther("0.015"));
  expect(participantFundingShortfall(parseEther("0.025"))).toBe(0n);
  expect(participantFundingShortfall(parseEther("1"))).toBe(0n);
  expect(() => participantFundingShortfall(-1n)).toThrow("negative");
});
