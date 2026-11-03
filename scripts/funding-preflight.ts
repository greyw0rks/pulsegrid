import { mkdir, readFile, writeFile } from "node:fs/promises";
import { ApiPromise, WsProvider } from "@polkadot/api";
import { decodeAddress, encodeAddress } from "@polkadot/util-crypto";
import { encodeDeployData, formatEther, keccak256, type Abi, type Hex } from "viem";
import { chainClients } from "../src/lib/registry";

const nativeAddress = process.argv[2];
if (!nativeAddress) throw new Error("Usage: pnpm exec tsx scripts/funding-preflight.ts <native public address>");
const { account, publicClient, config } = chainClients();
if (!account || config.network !== "testnet") throw new Error("Prepare the dedicated Pulsegrid testnet reporter first");
if (await publicClient.getChainId() !== config.chainId) throw new Error("EVM RPC chain mismatch");
const publicKey = decodeAddress(nativeAddress);
const mappedNativeAddress = `0x${keccak256(publicKey).slice(-40)}` as Hex;
const destinationAccountId = `${account.address.toLowerCase()}${"ee".repeat(12)}` as Hex;
const destination = encodeAddress(Buffer.from(destinationAccountId.slice(2), "hex"), 42);
const provider = new WsProvider(config.nativeRpc, false);
await provider.connect();
const api = await ApiPromise.create({ provider });
try {
  const [native, nativeMapping, recipientMapping, recipient, gasPrice, evmBalance] = await Promise.all([
    api.query.system.account(nativeAddress), api.query.revive.originalAccount(mappedNativeAddress), api.query.revive.originalAccount(account.address),
    api.query.system.account(destination), publicClient.getGasPrice(), publicClient.getBalance({ address: mappedNativeAddress })
  ]);
  const nativeJson = native.toJSON() as { data: { free: string | number } };
  const nativeFree = BigInt(nativeJson.data.free);
  const bytecode = JSON.parse(await readFile("contracts/out/IncidentRegistry.sol/IncidentRegistry.json", "utf8")) as { abi: Abi; bytecode: { object: Hex } };
  const data = encodeDeployData({ abi: bytecode.abi, bytecode: bytecode.bytecode.object, args: [account.address] });
  let deploymentGas: bigint | null = null;
  let estimateError: string | null = null;
  try { deploymentGas = await publicClient.estimateGas({ account: mappedNativeAddress, data }); }
  catch (error) { estimateError = error instanceof Error ? error.message.slice(0, 1000) : "Deployment gas estimate unavailable"; }
  const amountAtomic = 100000000000000n; // One native tPOT, 14 decimals.
  const transfer = api.tx.balances.transferKeepAlive(destination, amountAtomic.toString());
  const fee = await transfer.paymentInfo(nativeAddress);
  const genesis = api.genesisHash.toHex();
  const report = { schema: "pulsegrid.funding-preflight.v1", checkedAt: new Date().toISOString(), chainId: config.chainId, genesis,
    source: nativeAddress, sourceFreeAtomic: nativeFree.toString(), sourceFreeTPOT: (Number(nativeFree) / 1e14).toString(),
    sourceMappedEvm: mappedNativeAddress, sourceMapping: nativeMapping.toJSON(), sourceEvmBalanceWei: evmBalance.toString(),
    reporter: account.address, destinationNative: destination, destinationAccountId, recipientMapping: recipientMapping.toJSON(), recipient: recipient.toJSON(),
    proposedTransferAtomic: amountAtomic.toString(), proposedTransferTPOT: "1", estimatedNativeTransferFeeAtomic: fee.partialFee.toString(),
    existentialDepositAtomic: api.consts.balances.existentialDeposit.toString(),
    deploymentGas: deploymentGas?.toString() ?? null, gasPriceWei: gasPrice.toString(),
    estimatedDeploymentFeeTPOT: deploymentGas ? formatEther(deploymentGas * gasPrice) : null, estimateError,
    deploymentCodeHash: keccak256(data), unsignedTransfer: transfer.method.toHex(),
    signed: false, submitted: false,
    note: "Read-only preflight. Destination follows Revive's AccountId32 fallback mapping (H160 plus twelve 0xEE bytes). No funding transfer or deployment has been submitted." };
  await mkdir("docs/evidence", { recursive: true });
  await writeFile("docs/evidence/funding-preflight.json", `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
} finally { await api.disconnect(); }
