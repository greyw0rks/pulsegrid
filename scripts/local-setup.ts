import { spawnSync } from "node:child_process";

for (const args of [["scripts/local-config.mjs"], ["--import", "tsx", "scripts/local-db.ts"], ["--import", "tsx", "scripts/setup-db.ts"]]) {
  const result = spawnSync(process.execPath, args, { stdio: "inherit" });
  if (result.error || result.status !== 0) process.exit(result.status || 1);
}
