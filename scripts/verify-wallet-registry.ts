import { readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
const record = JSON.parse(await readFile("docs/evidence/wallet-registry-deployment-677.json", "utf8"));
if (record.chainId !== 677 || !/^0x[0-9a-f]{40}$/.test(record.registry) || !/^0x[0-9a-f]+$/.test(record.constructorArguments)) throw new Error("Invalid deployment record.");
const child = spawn(process.execPath, ["scripts/run-foundry.mjs", "forge", "verify-contract", record.registry,
  "src/MultiReporterIncidentRegistry.sol:MultiReporterIncidentRegistry", "--root", "contracts", "--chain", "677",
  "--verifier", "blockscout", "--verifier-url", "https://scan.botchain.ai/api/", "--constructor-args", record.constructorArguments, "--watch"], { stdio: "inherit" });
const status = await new Promise<number>((resolveStatus, reject) => { child.on("error", reject); child.on("exit", code => resolveStatus(code ?? 1)); });
if (status !== 0) throw new Error("BOTScan source verification did not complete.");
const response = await fetch(`https://scan.botchain.ai/api/v2/smart-contracts/${record.registry}`);
if (!response.ok) throw new Error("Verified source could not be retrieved.");
const verified = await response.json() as { is_verified: boolean; source_code: string; name: string };
const source = await readFile("contracts/src/MultiReporterIncidentRegistry.sol", "utf8");
if (!verified.is_verified || verified.name !== "MultiReporterIncidentRegistry" || verified.source_code.trim() !== source.trim()) throw new Error("BOTScan source differs from the deployed contract source.");
const report = { checkedAt: new Date().toISOString(), chainId: 677, registry: record.registry, sourceVerified: true, exactSourceMatch: true,
  explorer: `https://scan.botchain.ai/address/${record.registry}?tab=contract`, sourcePath: "contracts/src/MultiReporterIncidentRegistry.sol" };
await writeFile(resolve("docs/evidence/wallet-registry-source-verification.json"), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report));
