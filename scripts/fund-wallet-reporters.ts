import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { formatEther, keccak256, parseEther, parseTransaction, type Address, type Hex } from "viem";
import { chainClients } from "../src/lib/registry";
import { walletReporters } from "../src/lib/wallet-registry-abi";
import { participantFundingShortfall, participantGasTarget } from "../src/lib/wallet-funding";

const { config, chain, account, wallet, publicClient } = chainClients();
if (config.network !== "bot-mainnet" || config.chainId !== 677 || config.evmRpc !== "https://rpc.botchain.ai" || !account || !wallet || account.address.toLowerCase() !== walletReporters[0].toLowerCase()) throw new Error("The dedicated Pulsegrid BOT owner and official mainnet RPC are required.");
if (await publicClient.getChainId() !== 677) throw new Error("RPC chain mismatch.");
const recipients = walletReporters.slice(1);
const submit = process.argv.includes("--submit");
type Attempt = { chainId: 677; owner: Address; recipient: Address; amountWei: string; balanceBeforeWei: string; rawTransaction: Hex; transactionHash: Hex };
type Grant = { recipient: Address; amountBOT: string; balanceBeforeBOT: string; balanceAfterBOT: string; transactionHash: Hex | null; blockNumber?: string; paidFeeBOT?: string };
const grants: Grant[] = [];
const gasPrice = await publicClient.getGasPrice();
const plans = await Promise.all(recipients.map(async recipient => {
  const balance = await publicClient.getBalance({ address: recipient });
  return { recipient, balance, value: participantFundingShortfall(balance) };
}));
const total = plans.reduce((sum, plan) => sum + plan.value, 0n);
const maximumFees = BigInt(recipients.length) * 21000n * gasPrice;
const ownerBalance = await publicClient.getBalance({ address: account.address });
if (total > parseEther("0.1") || maximumFees > parseEther("0.01") || ownerBalance <= total + maximumFees + parseEther("0.05")) throw new Error("Funding exceeds the 0.1 BOT grant cap, 0.01 BOT fee cap, or owner's deployment reserve.");
console.log(JSON.stringify({ event: "participant_funding_preflight", chainId: 677, owner: account.address, targetBOT: formatEther(participantGasTarget),
  ownerBalanceBOT: formatEther(ownerBalance), totalShortfallBOT: formatEther(total), maximumFeesBOT: formatEther(maximumFees), submit,
  wallets: plans.map(plan => ({ address: plan.recipient, balanceBOT: formatEther(plan.balance), shortfallBOT: formatEther(plan.value) })) }));
if (submit) {
  await mkdir(".local", { recursive: true, mode: 0o700 });
  for (const plan of plans) {
    const path = `.local/participant-funding-677-${plan.recipient.toLowerCase()}.json`;
    let attempt: Attempt;
    if (existsSync(path)) {
      attempt = JSON.parse(await readFile(path, "utf8"));
      const signed = parseTransaction(attempt.rawTransaction);
      if (attempt.chainId !== 677 || attempt.owner.toLowerCase() !== account.address.toLowerCase() || attempt.recipient.toLowerCase() !== plan.recipient.toLowerCase() ||
        signed.chainId !== 677 || signed.to?.toLowerCase() !== plan.recipient.toLowerCase() || signed.value !== BigInt(attempt.amountWei) || signed.value <= 0n || signed.value > participantGasTarget ||
        (signed.data && signed.data !== "0x") || !signed.gas || !signed.gasPrice || signed.gas * signed.gasPrice > parseEther("0.0025") || keccak256(attempt.rawTransaction) !== attempt.transactionHash) throw new Error("Retained funding transaction does not match the authorized grant.");
    } else if (plan.value === 0n) {
      grants.push({ recipient: plan.recipient, amountBOT: "0", balanceBeforeBOT: formatEther(plan.balance), balanceAfterBOT: formatEther(plan.balance), transactionHash: null });
      continue;
    } else {
      if (await publicClient.getCode({ address: plan.recipient })) throw new Error("Participant is a contract wallet; request its own funding method rather than a fixed-gas EOA transfer.");
      const request = await publicClient.prepareTransactionRequest({ account, chain, to: plan.recipient, value: plan.value, gas: 21000n, gasPrice, type: "legacy" });
      const rawTransaction = await wallet.signTransaction(request);
      attempt = { chainId: 677, owner: account.address, recipient: plan.recipient, amountWei: plan.value.toString(), balanceBeforeWei: plan.balance.toString(), rawTransaction, transactionHash: keccak256(rawTransaction) };
      await writeFile(path, JSON.stringify(attempt) + "\n", { flag: "wx", mode: 0o600 });
    }
    const mined = await publicClient.getTransactionReceipt({ hash: attempt.transactionHash }).catch(error => {
      if (error.name === "TransactionReceiptNotFoundError") return null;
      throw error;
    });
    if (!mined) {
      const known = await publicClient.getTransaction({ hash: attempt.transactionHash }).catch(error => {
        if (error.name === "TransactionNotFoundError") return null;
        throw error;
      });
      if (!known) await publicClient.sendRawTransaction({ serializedTransaction: attempt.rawTransaction });
    }
    const receipt = mined ?? await publicClient.waitForTransactionReceipt({ hash: attempt.transactionHash, timeout: 120000 });
    const transaction = await publicClient.getTransaction({ hash: attempt.transactionHash });
    if (receipt.status !== "success" || receipt.from.toLowerCase() !== account.address.toLowerCase() || receipt.to?.toLowerCase() !== plan.recipient.toLowerCase() ||
      transaction.chainId !== 677 || transaction.value !== BigInt(attempt.amountWei) || transaction.input !== "0x") throw new Error("Funding receipt does not match the authorized grant.");
    const grant: Grant = { recipient: plan.recipient, amountBOT: formatEther(BigInt(attempt.amountWei)), balanceBeforeBOT: formatEther(BigInt(attempt.balanceBeforeWei)),
      balanceAfterBOT: formatEther(await publicClient.getBalance({ address: plan.recipient })), transactionHash: receipt.transactionHash, blockNumber: receipt.blockNumber.toString(), paidFeeBOT: formatEther(receipt.gasUsed * receipt.effectiveGasPrice) };
    grants.push(grant);
    console.log(JSON.stringify({ event: "participant_funding_confirmed", ...grant }));
  }
  const record = { schema: "pulsegrid.participant-gas-grants.v1", chainId: 677, owner: account.address, targetBOT: formatEther(participantGasTarget), grants, checkedAt: new Date().toISOString(),
    note: "User-authorized BOT mainnet gas grants to four user-confirmed participant wallets. Funding transfers do not count as core-product transactions or prove independent usage." };
  await mkdir("docs/evidence", { recursive: true });
  await writeFile("docs/evidence/participant-gas-grants-677.json", JSON.stringify(record, null, 2) + "\n");
}
