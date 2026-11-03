import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { ApiPromise, Keyring, WsProvider } from "@polkadot/api";
import { cryptoWaitReady } from "@polkadot/util-crypto";
import { formatEther } from "viem";
import { fallbackDestination, fundingAmount, validateFunding } from "../src/lib/funding";
import { chainClients } from "../src/lib/registry";

function argument(name: string) {
  const index = process.argv.indexOf(name);
  if (index < 0 || !process.argv[index + 1] || process.argv[index + 1].startsWith("--")) throw new Error(`Missing ${name}`);
  return process.argv[index + 1];
}
const source = argument("--source");
const walletPath = argument("--wallet");
const passwordPath = argument("--password-file");
const amount = fundingAmount(argument("--amount"));
const submit = process.argv.includes("--submit");
const { config, publicClient, account } = chainClients();
if (config.network !== "testnet" || !account) throw new Error("A dedicated testnet reporter must be configured");
const expectedGenesis = "0xd4f9acbcf7f52388d8b095abe3c198d19fc510e0343e643e87cfbccb155283bd";
if (await publicClient.getChainId() !== config.chainId) throw new Error("EVM chain mismatch");
await cryptoWaitReady();
const json = JSON.parse(await readFile(walletPath, "utf8"));
const pair = new Keyring({ type: "sr25519", ss58Format: 42 }).addFromJson(json);
await chmod(passwordPath, 0o600);
try { pair.decodePkcs8((await readFile(passwordPath, "utf8")).replace(/\r?\n$/, "")); }
catch { throw new Error("Unable to unlock the supplied wallet"); }
const provider = new WsProvider(config.nativeRpc, false);
await provider.connect();
const api = await ApiPromise.create({ provider });
try {
  if (api.genesisHash.toHex() !== expectedGenesis) throw new Error("Native genesis mismatch");
  const destination = fallbackDestination(account.address);
  const mapping = await api.query.revive.originalAccount(account.address);
  if (!mapping.isEmpty) throw new Error("Reporter has a registered native mapping; recheck destination before funding");
  const native = await api.query.system.account(source);
  const data = (native.toJSON() as { data: { free: string | number; frozen: string | number } }).data;
  const transfer = api.tx.balances.transferKeepAlive(destination, amount.toString());
  const fee = await transfer.paymentInfo(source);
  validateFunding({ source, signer: pair.address, free: BigInt(data.free), frozen: BigInt(data.frozen), amount, fee: fee.partialFee.toBigInt(), existentialDeposit: BigInt(api.consts.balances.existentialDeposit.toString()) });
  const reportPath = `docs/evidence/reporter-funding-${config.chainId}-${account.address.toLowerCase()}.json`;
  const report = { schema: "pulsegrid.reporter-funding.v1", checkedAt: new Date().toISOString(), chainId: config.chainId, genesis: expectedGenesis,
    source, reporter: account.address, destination, amountAtomic: amount.toString(), estimatedFeeAtomic: fee.partialFee.toString(),
    status: "prepared", transactionHash: "", blockHash: "", events: [] as unknown[], evmBalanceWei: "" };
  if (!submit) { console.log(JSON.stringify({ ...report, signed: false, submitted: false }, null, 2)); }
  else {
    await mkdir("docs/evidence", { recursive: true });
    // Exclusive creation prevents a restart from transferring a second funding amount.
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
    await transfer.signAsync(pair, { nonce: -1 });
    report.transactionHash = transfer.hash.toHex();
    report.status = "signed";
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify({ event: "funding_signed", transactionHash: report.transactionHash, reportPath }));
    await new Promise<void>((resolve, reject) => {
      let unsubscribe: (() => void) | undefined;
      let done = false;
      const timer = setTimeout(() => { done = true; unsubscribe?.(); reject(new Error("Funding confirmation timed out; reconcile the retained hash before retrying")); }, 120_000);
      transfer.send(result => {
        if (done) return;
        if (result.status.isInvalid || result.status.isDropped || result.status.isUsurped) {
          done = true; clearTimeout(timer); unsubscribe?.(); reject(new Error(`Funding transaction ${result.status.type}`)); return;
        }
        if (!result.status.isFinalized) return;
        done = true; clearTimeout(timer); unsubscribe?.();
        report.blockHash = result.status.asFinalized.toHex();
        report.events = result.events.map(({ event }) => ({ section: event.section, method: event.method, data: event.data.toJSON() }));
        if (result.dispatchError || !result.events.some(({ event }) => event.section === "system" && event.method === "ExtrinsicSuccess")) {
          report.status = "failed";
          void writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`).then(() => reject(new Error("Funding failed; inspect retained dispatch events")), reject);
        } else {
          report.status = "finalized";
          void writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`).then(resolve, reject);
        }
      }).then(stop => { unsubscribe = stop; if (done) stop(); }, error => { done = true; clearTimeout(timer); reject(error); });
    });
    const balance = await publicClient.getBalance({ address: account.address });
    report.evmBalanceWei = balance.toString();
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    if (balance === 0n) throw new Error("Native funding finalized, but EVM spending balance remains zero; do not repeat funding");
    console.log(JSON.stringify({ event: "reporter_funded", ...report, evmBalanceTPOT: formatEther(balance), reportPath }, null, 2));
  }
} finally { pair.lock(); await api.disconnect(); }
