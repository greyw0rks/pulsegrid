import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";

if (existsSync(".env.local") || existsSync(".env")) {
  console.log("Existing Pulsegrid configuration preserved.");
} else {
  mkdirSync(".local", { recursive: true, mode: 0o700 });
  const password = randomBytes(24).toString("hex");
  const token = randomBytes(32).toString("hex");
  const template = readFileSync(".env.example", "utf8")
    .replace(/^DATABASE_URL=.*$/m, `DATABASE_URL=postgresql://pulsegrid:${password}@127.0.0.1:5434/pulsegrid`)
    .replace(/^PULSEGRID_OPERATOR_TOKEN=.*$/m, `PULSEGRID_OPERATOR_TOKEN=${token}`)
    .replace(/^PULSEGRID_SITE_URL=.*$/m, "PULSEGRID_SITE_URL=http://localhost:3023");
  writeFileSync(".env.local", template, { flag: "wx", mode: 0o600 });
  console.log("Created .env.local with separate local database credentials and an operator token. No signer was configured.");
}
