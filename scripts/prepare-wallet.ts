import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { privateKeyToAccount } from "viem/accounts";
import type { Hex } from "viem";
import { runtimeConfig } from "../src/lib/env";

const config = runtimeConfig();
const target = resolve(process.env.PULSEGRID_KEY_FILE || `.local/${config.network}-wallet.json`);
const privateKey = `0x${randomBytes(32).toString("hex")}` as Hex;
const account = privateKeyToAccount(privateKey);
const wallet = {
  schema: "pulsegrid.wallet.v1",
  network: config.network,
  chainId: config.chainId,
  address: account.address,
  privateKey,
  createdAt: new Date().toISOString()
};

await mkdir(dirname(target), { recursive: true, mode: 0o700 });
try {
  await writeFile(target, `${JSON.stringify(wallet, null, 2)}\n`, { flag: "wx", mode: 0o600 });
} catch (error) {
  if (error instanceof Error && "code" in error && error.code === "EEXIST") {
    throw new Error(`Wallet file already exists at ${target}; it was not overwritten`);
  }
  throw error;
}

console.log(JSON.stringify({ event: "wallet_created", network: config.networkName, chainId: config.chainId, address: account.address, file: target }));
