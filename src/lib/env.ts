import { config as loadEnv } from "dotenv";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { isAddress, type Address, type Hex } from "viem";

loadEnv({ path: [".env.local", ".env"], quiet: true });

export const PORTALDOT_CHAIN_ID = 420420777;
export const PORTALDOT_EVM_RPC = "https://test-evm-rpc-v3.portaldot.dev";
export const PORTALDOT_NATIVE_RPC = "wss://test-node-v3.portaldot.dev";
export const VERSION = "0.1.0";

export function runtimeConfig() {
  const network = process.env.PULSEGRID_NETWORK || "testnet";
  if (network !== "testnet" && network !== "local") throw new Error("PULSEGRID_NETWORK must be testnet or local");
  const registry = process.env.PULSEGRID_REGISTRY_ADDRESS || undefined;
  if (registry && !isAddress(registry)) throw new Error("Invalid registry address");
  return {
    network,
    chainId: network === "local" ? 31337 : PORTALDOT_CHAIN_ID,
    networkName: network === "local" ? "Local integration chain" : "Portaldot V3 testnet",
    evmRpc: process.env.PULSEGRID_EVM_RPC || PORTALDOT_EVM_RPC,
    nativeRpc: process.env.PULSEGRID_NATIVE_RPC || PORTALDOT_NATIVE_RPC,
    nativeGenesis: process.env.PULSEGRID_NATIVE_GENESIS || undefined,
    registry: registry as Address | undefined,
    deploymentBlock: BigInt(process.env.PULSEGRID_DEPLOYMENT_BLOCK || "0"),
    drillsEnabled: process.env.PULSEGRID_ENABLE_DRILLS === "true" && process.env.NODE_ENV !== "production",
    operatorToken: process.env.PULSEGRID_OPERATOR_TOKEN || "",
    heartbeatMaxAgeMs: Math.max(20000, Math.min(3600000, Number(process.env.PULSEGRID_HEARTBEAT_MAX_AGE_MS) || 20000)),
    siteUrl: process.env.PULSEGRID_SITE_URL || "http://localhost:3000",
    scheduledMonitoring: process.env.PULSEGRID_SCHEDULED_MONITORING === "true",
    allowedHosts: (process.env.PULSEGRID_ALLOWED_HOSTS || "test-evm-rpc-v3.portaldot.dev,test-node-v3.portaldot.dev")
      .split(",").map(x => x.trim().toLowerCase()).filter(Boolean)
  };
}

export function projectPrivateKey(): Hex | undefined {
  const direct = process.env.PULSEGRID_PRIVATE_KEY;
  if (direct) {
    if (!/^0x[0-9a-fA-F]{64}$/.test(direct)) throw new Error("Invalid project private key configuration");
    return direct as Hex;
  }
  const file = resolve(/* turbopackIgnore: true */ process.env.PULSEGRID_KEY_FILE || ".local/testnet-wallet.json");
  if (!existsSync(/* turbopackIgnore: true */ file)) return undefined;
  const wallet = JSON.parse(readFileSync(/* turbopackIgnore: true */ file, "utf8")) as { privateKey?: string; network?: string };
  if (wallet.network !== runtimeConfig().network) throw new Error("Wallet belongs to a different network");
  if (!wallet.privateKey || !/^0x[0-9a-fA-F]{64}$/.test(wallet.privateKey)) throw new Error("Invalid project wallet file");
  return wallet.privateKey as Hex;
}
