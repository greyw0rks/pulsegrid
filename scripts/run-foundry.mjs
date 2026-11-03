import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";
import { spawnSync } from "node:child_process";

const [command, ...args] = process.argv.slice(2);
if (!command) {
  console.error("Usage: node scripts/run-foundry.mjs <forge|anvil|cast> [...args]");
  process.exit(2);
}

const configured = process.env.FOUNDRY_BIN ? join(process.env.FOUNDRY_BIN, command) : null;
const installed = join(homedir(), ".foundry", "bin", command);
const executable = configured && existsSync(configured) ? configured : existsSync(installed) ? installed : command;
const foundryBin = executable === command ? "" : `${join(homedir(), ".foundry", "bin")}${delimiter}`;
const result = spawnSync(executable, args, {
  stdio: "inherit",
  env: { ...process.env, PATH: `${foundryBin}${process.env.PATH || ""}` }
});

if (result.error) {
  console.error(`Unable to run ${command}: ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status ?? 1);
