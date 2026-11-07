import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { encodeDeployData, formatEther, keccak256, parseEther, type Abi, type Hex } from "viem";
import { chainClients } from "../src/lib/registry";

type Artifact = { abi: Abi; bytecode: { object: Hex } };
const artifactPath = resolve("contracts/out/IncidentRegistry.sol/IncidentRegistry.json");
const artifact = JSON.parse(await readFile(artifactPath, "utf8")) as Artifact;
const clients = chainClients();
const { account, wallet, publicClient, config } = clients;

if (!account || !wallet) throw new Error("No Pulsegrid signer is configured; run pnpm wallet:prepare or set PULSEGRID_PRIVATE_KEY");
const observedChainId = await publicClient.getChainId();
if (observedChainId !== config.chainId) throw new Error(`RPC chain mismatch: expected ${config.chainId}, received ${observedChainId}`);
const balance = await publicClient.getBalance({ address: account.address });
if (balance === 0n) throw new Error(`Reporter ${account.address} has no native balance on ${config.networkName}`);

const data = encodeDeployData({ abi: artifact.abi, bytecode: artifact.bytecode.object, args: [account.address] });
const codeHash = keccak256(data);
const attemptPath = resolve(`.local/deployment-attempt-${config.chainId}-${account.address.toLowerCase()}.json`);
let attempt: { chainId: number; reporter: string; codeHash: Hex; transactionHash: Hex; rawTransaction: Hex; estimatedMaxFeeWei: string };
if (existsSync(attemptPath)) {
  attempt = JSON.parse(await readFile(attemptPath, "utf8"));
  if (attempt.chainId !== config.chainId || attempt.reporter !== account.address || attempt.codeHash !== codeHash || keccak256(attempt.rawTransaction) !== attempt.transactionHash) throw new Error("Retained deployment attempt does not match this configuration");
  console.log(JSON.stringify({ event: "deployment_resumed", transactionHash: attempt.transactionHash }));
} else {
  const estimatedGas = await publicClient.estimateGas({ account, data });
  const gas = estimatedGas * 105n / 100n;
  const gasPrice = await publicClient.getGasPrice();
  const maxFee = gas * gasPrice;
  const budget = parseEther(process.env.PULSEGRID_DEPLOYMENT_MAX_COST || (config.network === "testnet" ? "220" : "1"));
  if (maxFee > budget || maxFee >= balance) throw new Error(`Deployment maximum fee ${formatEther(maxFee)} exceeds budget or reporter balance`);
  const prepared = await publicClient.prepareTransactionRequest({ account, chain: clients.chain, data, gas, gasPrice, type: "legacy" });
  const rawTransaction = await wallet.signTransaction(prepared);
  attempt = { chainId: config.chainId, reporter: account.address, codeHash, transactionHash: keccak256(rawTransaction), rawTransaction, estimatedMaxFeeWei: maxFee.toString() };
  await mkdir(dirname(attemptPath), { recursive: true, mode: 0o700 });
  // Retain the same signed transaction across retries, before submitting it to the RPC.
  await writeFile(attemptPath, `${JSON.stringify(attempt, null, 2)}\n`, { flag: "wx", mode: 0o600 });
  console.log(JSON.stringify({ event: "deployment_prepared", transactionHash: attempt.transactionHash, estimatedMaxFeeNative: formatEther(maxFee), nativeCurrency: config.nativeCurrency.symbol }));
}
const transactionHash = attempt.transactionHash;
const alreadyMined = await publicClient.getTransactionReceipt({ hash: transactionHash }).catch(error => {
  if (error.name === "TransactionReceiptNotFoundError") return null;
  throw error;
});
if (!alreadyMined) await publicClient.sendRawTransaction({ serializedTransaction: attempt.rawTransaction });
const receipt = await publicClient.waitForTransactionReceipt({ hash: transactionHash, confirmations: 1, timeout: 120_000 });
if (receipt.status !== "success" || !receipt.contractAddress) throw new Error(`Deployment transaction ${transactionHash} did not succeed`);
const code = await publicClient.getCode({ address: receipt.contractAddress });
if (!code || code === "0x") throw new Error("Deployment receipt did not produce contract code");
const reporter = await publicClient.readContract({ address: receipt.contractAddress, abi: artifact.abi, functionName: "authorizedReporter" });
if (typeof reporter !== "string" || reporter.toLowerCase() !== account.address.toLowerCase()) throw new Error("Deployed reporter does not match the configured signer");

const record = {
  schema: "pulsegrid.deployment.v1",
  network: config.network,
  networkName: config.networkName,
  chainId: config.chainId,
  contract: receipt.contractAddress,
  reporter: account.address,
  transactionHash,
  blockNumber: receipt.blockNumber.toString(),
  blockHash: receipt.blockHash,
  status: receipt.status,
  gasUsed: receipt.gasUsed.toString(),
  effectiveGasPriceWei: receipt.effectiveGasPrice.toString(),
  ...(config.network === "testnet" ? { paidFeeTPOT: formatEther(receipt.gasUsed * receipt.effectiveGasPrice) } : {}),
  paidFeeNative: formatEther(receipt.gasUsed * receipt.effectiveGasPrice),
  nativeCurrency: config.nativeCurrency.symbol,
  deploymentCodeHash: codeHash,
  runtimeCodeHash: keccak256(code),
  deployedAt: new Date().toISOString()
};
const recordPath = resolve(`docs/evidence/deployment-${config.chainId}-${receipt.contractAddress.toLowerCase()}.json`);
await mkdir(dirname(recordPath), { recursive: true });
if (!existsSync(recordPath)) await writeFile(recordPath, `${JSON.stringify(record, null, 2)}\n`, { flag: "wx" });
console.log(JSON.stringify({ event: "registry_deployed", ...record, recordPath }));
