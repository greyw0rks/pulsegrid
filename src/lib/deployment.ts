import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { keccak256 } from "viem";
import { z } from "zod";
import { chainClients, registryAbi } from "./registry";

const hash = z.string().regex(/^0x[0-9a-fA-F]{64}$/);
const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
const deploymentRecord = z.object({
  schema: z.literal("pulsegrid.deployment.v1"), network: z.enum(["testnet", "local"]), networkName: z.string(), chainId: z.number().int(),
  contract: address, reporter: address, transactionHash: hash, blockNumber: z.string().regex(/^\d+$/), blockHash: hash,
  status: z.literal("success"), gasUsed: z.string(), effectiveGasPriceWei: z.string(), paidFeeTPOT: z.string(),
  deploymentCodeHash: hash, runtimeCodeHash: hash, deployedAt: z.iso.datetime()
});

export async function getDeploymentProof() {
  const { config, publicClient } = chainClients();
  const base = { network: config.networkName, chainId: config.chainId, contract: config.registry ?? null, checkedAt: new Date().toISOString() };
  if (!config.registry) return { ...base, state: "pending", reason: "Registry deployment is pending.", record: null };
  try {
    const file = resolve(/* turbopackIgnore: true */ `docs/evidence/deployment-${config.chainId}-${config.registry.toLowerCase()}.json`);
    const record = deploymentRecord.parse(JSON.parse(await readFile(/* turbopackIgnore: true */ file, "utf8")));
    if (record.chainId !== config.chainId || record.network !== config.network || record.contract.toLowerCase() !== config.registry.toLowerCase()) throw new Error("Record configuration mismatch");
    if (await publicClient.getChainId() !== config.chainId) throw new Error("RPC chain mismatch");
    const [receipt, code, reporter] = await Promise.all([
      publicClient.getTransactionReceipt({ hash: record.transactionHash as `0x${string}` }), publicClient.getCode({ address: config.registry }),
      publicClient.readContract({ address: config.registry, abi: registryAbi, functionName: "authorizedReporter" })
    ]);
    if (receipt.status !== "success" || receipt.contractAddress?.toLowerCase() !== record.contract.toLowerCase() || receipt.blockHash !== record.blockHash || receipt.blockNumber.toString() !== record.blockNumber || !code || code === "0x" || keccak256(code) !== record.runtimeCodeHash || reporter.toLowerCase() !== record.reporter.toLowerCase()) throw new Error("Live deployment does not match the retained proof");
    return { ...base, state: "verified", reason: "Successful receipt, runtime code, and authorized reporter verified against the RPC.", record };
  } catch {
    return { ...base, state: "unavailable", reason: "Deployment proof could not be verified against the current RPC. Try again shortly.", record: null };
  }
}
