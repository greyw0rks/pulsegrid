import { mkdir, writeFile } from "node:fs/promises";
import { ApiPromise, WsProvider } from "@polkadot/api";
import { decodeAddress } from "@polkadot/util-crypto";
import { runtimeConfig } from "../src/lib/env";

const address = process.argv[2];
if (!address) throw new Error("Usage: pnpm exec tsx scripts/inspect-account.ts <native public address>");
decodeAddress(address);
const config = runtimeConfig();
if (config.network !== "testnet") throw new Error("Native account inspection requires the public testnet configuration");
const provider = new WsProvider(config.nativeRpc, false);
await provider.connect();
const api = await ApiPromise.create({ provider });
try {
  const [account, properties, name, genesis] = await Promise.all([api.query.system.account(address), api.rpc.system.properties(), api.rpc.system.chain(), api.rpc.chain.getBlockHash(0)]);
  const pallets = api.runtimeMetadata.asLatest.pallets.map(pallet => pallet.name.toString());
  const execution = Object.fromEntries(Object.entries(api.tx).filter(([pallet]) => /^(evm|ethereum|revive|contracts)$/i.test(pallet))
    .map(([pallet, methods]) => [pallet, Object.fromEntries(Object.entries(methods).map(([method, transaction]) => [method, transaction.meta.toJSON()]))]));
  const report = { checkedAt: new Date().toISOString(), network: config.networkName, address,
    account: account.toJSON(), properties: properties.toJSON(), chain: name.toString(), genesis: genesis.toHex(),
    runtime: api.runtimeVersion.toJSON(), pallets, execution, signingAttempted: false,
    note: "Read-only native account and runtime metadata. Native balance does not establish EVM spending authority." };
  await mkdir("docs/evidence", { recursive: true });
  await writeFile("docs/evidence/native-account-inspection.json", `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ checkedAt: report.checkedAt, address, chain: report.chain, account: report.account,
    properties: report.properties, genesis: report.genesis, executionMethods: Object.fromEntries(Object.entries(execution).map(([pallet, methods]) => [pallet, Object.keys(methods)])),
    reportPath: "docs/evidence/native-account-inspection.json", signingAttempted: false }, null, 2));
} finally { await api.disconnect(); }
