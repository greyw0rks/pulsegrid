import { readFile, writeFile } from "node:fs/promises";
import { encodeDeployData, formatEther, parseEther, type Abi, type Hex } from "viem";
import { chainClients } from "../src/lib/registry";

const { config, account, publicClient } = chainClients();
const expected = "0xE79bB36b53835f0740BD4a9684F5C84d8fB9b52C";
if (config.network !== "bot-mainnet" || config.chainId !== 677 || account?.address.toLowerCase() !== expected.toLowerCase()) throw new Error("BOT Chain deployment identity mismatch");
if (await publicClient.getChainId() !== 677) throw new Error("RPC chain identity mismatch");
const artifact = JSON.parse(await readFile("contracts/out/IncidentRegistry.sol/IncidentRegistry.json", "utf8")) as { abi: Abi; bytecode: { object: Hex } };
const data = encodeDeployData({ abi: artifact.abi, bytecode: artifact.bytecode.object, args: [account.address] });
const [balance, gasPrice, estimatedGas, latest, pendingNonce] = await Promise.all([
  publicClient.getBalance({address: account.address}), publicClient.getGasPrice(), publicClient.estimateGas({account,data}), publicClient.getBlockNumber(), publicClient.getTransactionCount({address:account.address,blockTag:"pending"})
]);
const logs = await publicClient.getLogs({address:"0xaE6ae8630f7A888dEc0B9195C85F7515d5887655",fromBlock:latest-99n,toBlock:latest});
const maximumFee = estimatedGas * 105n / 100n * gasPrice;
if (maximumFee > parseEther("0.1") || maximumFee >= balance) throw new Error("Deployment exceeds the 0.1 BOT cap or available balance");
const report = {checkedAt:new Date().toISOString(),chainId:677,network:config.networkName,deployer:account.address,balanceBOT:formatEther(balance),pendingNonce,estimatedGas:estimatedGas.toString(),gasPriceWei:gasPrice.toString(),maximumFeeBOT:formatEther(maximumFee),budgetBOT:"0.1",logQuery:{fromBlock:(latest-99n).toString(),toBlock:latest.toString(),logs:logs.length},submitted:false};
await writeFile("docs/evidence/bot-mainnet-preflight.json",JSON.stringify(report,null,2)+"\n");
console.log(JSON.stringify(report));
