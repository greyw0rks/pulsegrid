import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { encodeAbiParameters, encodeDeployData, formatEther, keccak256, parseEther, parseTransaction, type Abi, type Hex } from "viem";
import { chainClients } from "../src/lib/registry";
import { walletRegistryAbi, walletReporters } from "../src/lib/wallet-registry-abi";

const { config, chain, account, wallet, publicClient } = chainClients();
if (config.network !== "bot-mainnet" || config.chainId !== 677 || !account || !wallet || account.address.toLowerCase() !== walletReporters[0].toLowerCase() || config.evmRpc !== "https://rpc.botchain.ai") throw new Error("The dedicated Pulsegrid BOT owner and official mainnet RPC are required.");
if (await publicClient.getChainId() !== 677) throw new Error("RPC chain mismatch");
const artifact = JSON.parse(await readFile("contracts/out/MultiReporterIncidentRegistry.sol/MultiReporterIncidentRegistry.json", "utf8")) as { abi: Abi; bytecode: { object: Hex } };
const others = walletReporters.slice(1);
const data = encodeDeployData({ abi: artifact.abi, bytecode: artifact.bytecode.object, args: [account.address, others] });
const deploymentCodeHash = keccak256(data);
const reportPath = "docs/evidence/wallet-registry-deployment-677.json";
const attemptPath = ".local/wallet-registry-deployment-677.json";
if (existsSync(reportPath)) {
  const record = JSON.parse(await readFile(reportPath, "utf8"));
  const receipt = await publicClient.getTransactionReceipt({ hash: record.transactionHash });
  const transaction = await publicClient.getTransaction({ hash: record.transactionHash });
  if (receipt.status !== "success" || receipt.contractAddress?.toLowerCase() !== record.registry.toLowerCase() || record.deploymentCodeHash !== deploymentCodeHash || transaction.input !== data || transaction.chainId !== 677 || transaction.from.toLowerCase() !== account.address.toLowerCase()) throw new Error("Retained deployment does not match this contract or chain");
  console.log(JSON.stringify({ event: "wallet_registry_already_deployed", registry: record.registry, transactionHash: record.transactionHash }));
} else {
  const [balance, estimatedGas, gasPrice, reporterBalances] = await Promise.all([
    publicClient.getBalance({ address: account.address }), publicClient.estimateGas({ account, data }), publicClient.getGasPrice(),
    Promise.all(others.map(async address => ({ address, balanceBOT: formatEther(await publicClient.getBalance({ address })) })))
  ]);
  const gas = estimatedGas * 115n / 100n;
  const maximumCost = gas * gasPrice;
  if (maximumCost > parseEther("0.05") || maximumCost >= balance) throw new Error("Deployment exceeds the 0.05 BOT maximum fee or owner's balance.");
  console.log(JSON.stringify({ event: "wallet_registry_preflight", chainId: 677, owner: account.address, reporters: walletReporters,
    maximumDeploymentFeeBOT: formatEther(maximumCost), ownerBalanceBOT: formatEther(balance), participantBalances: reporterBalances, submit: process.argv.includes("--submit") }));
  if (process.argv.includes("--submit")) {
    let attempt: { chainId: number; owner: string; deploymentCodeHash: Hex; rawTransaction: Hex; transactionHash: Hex };
    if (existsSync(attemptPath)) {
      attempt = JSON.parse(await readFile(attemptPath, "utf8"));
      const signed = parseTransaction(attempt.rawTransaction);
      if (attempt.chainId !== 677 || attempt.owner.toLowerCase() !== account.address.toLowerCase() || attempt.deploymentCodeHash !== deploymentCodeHash || keccak256(attempt.rawTransaction) !== attempt.transactionHash || signed.chainId !== 677 || signed.to || signed.data !== data || (signed.value ?? 0n) !== 0n || !signed.gas || !signed.gasPrice || signed.gas * signed.gasPrice > parseEther("0.05")) throw new Error("Retained signed deployment does not match this configuration.");
    } else {
      const request = await publicClient.prepareTransactionRequest({ account, chain, data, gas, gasPrice, type: "legacy" });
      const rawTransaction = await wallet.signTransaction(request);
      attempt = { chainId: 677, owner: account.address, deploymentCodeHash, rawTransaction, transactionHash: keccak256(rawTransaction) };
      await mkdir(".local", { recursive: true, mode: 0o700 });
      await writeFile(attemptPath, JSON.stringify(attempt) + "\n", { flag: "wx", mode: 0o600 });
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
    if (receipt.status !== "success" || !receipt.contractAddress) throw new Error("Wallet registry deployment did not succeed.");
    const registry = receipt.contractAddress;
    const [owner, code, permissions] = await Promise.all([publicClient.readContract({ address: registry, abi: walletRegistryAbi, functionName: "owner" }),
      publicClient.getCode({ address: registry }), Promise.all(walletReporters.map(address => publicClient.readContract({ address: registry, abi: walletRegistryAbi, functionName: "isReporter", args: [address] })))]);
    if (owner.toLowerCase() !== account.address.toLowerCase() || !code || permissions.some(enabled => !enabled)) throw new Error("Deployed code, owner, or reporter permissions did not match.");
    const record = { schema: "pulsegrid.wallet-registry-deployment.v1", chainId: 677, registry, owner, reporters: walletReporters,
      contractName: "MultiReporterIncidentRegistry", transactionHash: receipt.transactionHash, blockNumber: receipt.blockNumber.toString(), blockHash: receipt.blockHash,
      status: receipt.status, paidFeeBOT: formatEther(receipt.gasUsed * receipt.effectiveGasPrice), deploymentCodeHash, runtimeCodeHash: keccak256(code),
      constructorArguments: encodeAbiParameters([{ type: "address" }, { type: "address[]" }], [owner, others]), deployedAt: new Date().toISOString(),
      note: "Additional registry for wallet attestations; original registry and history remain accessible. Deployment and permission events are excluded from core-product counts." };
    await mkdir("docs/evidence", { recursive: true });
    await writeFile(reportPath, JSON.stringify(record, null, 2) + "\n", { flag: "wx" });
    console.log(JSON.stringify({ event: "wallet_registry_deployed", ...record }));
  }
}
