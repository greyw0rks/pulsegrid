import { chromium, expect as baseExpect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { keccak256, stringToHex } from "viem";
import { walletReporters } from "../src/lib/wallet-registry-abi";
import type { WalletReportOverview } from "../src/lib/wallet-report-types";
const base = "https://pulsegrid-psi.vercel.app/bot";
const expect = baseExpect.configure({ timeout: 30000 });
const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
const findings = [], preflights = [];
try {
  for (const width of [1280, 390, 360]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    for (let attempt = 0; ; attempt++) {
      try { await page.goto(base + "/reports", { waitUntil: "domcontentloaded", timeout: 60000 }); break; }
      catch (error) { if (attempt >= 2 || !String(error).includes("ERR_NETWORK_CHANGED")) throw error; }
    }
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Report with your wallet");
    await expect(page.getByText("Contract verified", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Connect reporter wallet", exact: true })).toBeEnabled();
    await expect(page.getByRole("button", { name: "Attest incident", exact: true })).toBeDisabled();
    await expect(page.getByText("Controlled drill source", { exact: true })).toBeVisible();
    const overviewResponse = await page.request.get(base + "/api/wallet-reports");
    if (!overviewResponse.ok()) throw new Error("Public wallet overview unavailable.");
    const overview = await overviewResponse.json() as WalletReportOverview;
    if (overview.state !== "ready" || overview.reporters.length !== 5 || overview.reporters.some(reporter => !reporter.enabled)) throw new Error("All five approved wallet permissions must be verified.");
    await page.getByText("Approved reporter addresses", { exact: true }).click();
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) throw new Error(`Reports overflow at ${width}px`);
    await mkdir("docs/evidence/wallet-report-ui", { recursive: true });
    await page.screenshot({ path: `docs/evidence/wallet-report-ui/reports-${width}.png`, fullPage: true });
    if (width === 1280) {
      const source = overview.sources[0];
      if (!source) throw new Error("Retained source evidence is missing.");
      for (const account of walletReporters.slice(1)) {
        const response = await page.request.post(base + "/api/wallet-reports/prepare", { data: { account, incidentId: source.id, action: "open" } });
        const result = await response.json();
        if (!response.ok() || result.transaction.from.toLowerCase() !== account.toLowerCase() || result.transaction.to.toLowerCase() !== overview.registry?.toLowerCase() || result.transaction.value !== "0x0" || !result.simulated || Number(result.maximumFeeBOT) > 0.05) throw new Error(`Participant preflight failed for ${account}: ${JSON.stringify(result)}`);
        preflights.push({ account, maximumFeeBOT: result.maximumFeeBOT, evidenceHash: result.evidenceHash, noSigning: true });
      }
      for (const digest of [source.openingEvidence, source.recoveryEvidence]) {
        if (!digest) throw new Error("Both evidence transitions are required.");
        const response = await page.request.get(base + "/api/evidence/" + digest);
        const canonical = await response.text();
        if (!response.ok() || keccak256(stringToHex(canonical)) !== digest) throw new Error("Canonical evidence download does not match its digest.");
      }
    }
    await page.getByRole("link", { name: "Review the original incident", exact: true }).click();
    await expect(page).toHaveURL(base + "/incidents/145e6abe-5a87-469d-ada5-d17b252b0799");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Controlled BOT mainnet recovery drill");
    await page.getByRole("link", { name: "Inspect source", exact: true }).first().click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Digest verified");
    if (errors.length) throw new Error(errors.join("; "));
    findings.push({ width, reportsReady: true, fiveWalletPermissions: true, historicalDrillLabel: true, incidentAndEvidenceNavigation: true, overflow: false, errors });
    await page.close();
  }
} finally { await browser.close(); }
const report = { checkedAt: new Date().toISOString(), website: base + "/reports", readOnly: true, findings, participantPreflights: preflights };
await writeFile("docs/evidence/wallet-report-live.json", JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report));
