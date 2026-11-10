import { chromium, expect as baseExpect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { encodeFunctionData } from "viem";
import { walletRegistryAbi, walletReporters } from "../src/lib/wallet-registry-abi";
import type { WalletReportOverview } from "../src/lib/wallet-report-types";

const base = process.env.PULSEGRID_BROWSER_BASE || "https://pulsegrid-psi.vercel.app/bot";
const expect = baseExpect.configure({ timeout: 20000 });
const registry = "0x1111111111111111111111111111111111111111";
const opening = `0x${"11".repeat(32)}` as const, recovery = `0x${"22".repeat(32)}` as const;
const reportKey = `0x${"33".repeat(32)}` as const, endpointId = `0x${"44".repeat(32)}` as const;
const sourceId = "145e6abe-5a87-469d-ada5-d17b252b0799";
const openingTx = `0x${"55".repeat(32)}`, recoveryTx = `0x${"66".repeat(32)}`;
const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
const findings = [];
try {
  for (const width of [1280, 390, 360]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    let sent = 0, confirmed = 0, receiptState = "pending", tampered = true;
    await context.exposeBinding("fixtureWalletSend", () => { sent++; return sent === 1 ? openingTx : recoveryTx; });
    await context.addInitScript(`window.ethereum = {
      request: async function(input) {
        if (input.method === 'eth_chainId') return '0x2a5';
        if (input.method === 'eth_requestAccounts' || input.method === 'eth_accounts') return [${JSON.stringify(walletReporters[1])}];
        if (input.method === 'eth_sendTransaction') return window.fixtureWalletSend();
        throw new Error('Unexpected wallet request: ' + input.method);
      }, on: function() {}, removeListener: function() {}
    };`);
    const overview = (): WalletReportOverview => ({ state: "ready", reason: "Browser fixture: no real signing or chain activity.", registry,
      reporters: walletReporters.map(address => ({ address, enabled: true })), sources: [{ id: sourceId, name: "Controlled fixture source",
        reportKey, endpointId, severity: 2, openingEvidence: opening, recoveryEvidence: recovery, simulated: true,
        observedAt: "2026-11-07T16:00:00.000Z", recoveredAt: "2026-11-07T16:30:00.000Z" }],
      records: confirmed ? [{ id: "1", reporter: walletReporters[1], reportKey, endpointId, status: confirmed === 2 ? 1 : 0,
        openingEvidence: opening, recoveryEvidence: confirmed === 2 ? recovery : `0x${"00".repeat(32)}`, openedAt: "1000", resolvedAt: confirmed === 2 ? "1200" : "0" }] : [],
      events: [], eventsAvailable: true, completeEventHistory: true, chainIncidentCount: confirmed ? "1" : "0", checkedAt: "2026-11-10T21:00:00.000Z" });
    await context.route("**/api/wallet-reports**", async route => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith("/prepare")) {
        const input = route.request().postDataJSON() as { action: "open" | "resolve" };
        await route.fulfill({ json: { maximumFeeBOT: "0.0046", evidenceHash: input.action === "open" ? opening : recovery,
          transaction: { from: walletReporters[1], to: registry, chainId: "0x2a5", value: tampered ? "0x1" : "0x0", gas: "0x38270", gasPrice: "0x4a817c800",
            data: input.action === "open" ? encodeFunctionData({ abi: walletRegistryAbi, functionName: "openIncident", args: [reportKey, endpointId, 2, opening] })
              : encodeFunctionData({ abi: walletRegistryAbi, functionName: "resolveIncident", args: [1n, recovery] }) } } });
      } else if (url.pathname.endsWith("/receipt")) {
        if (receiptState === "confirmed") confirmed = sent;
        await route.fulfill({ json: { state: receiptState } });
      } else await route.fulfill({ json: overview() });
    });
    await page.goto(base + "/reports", { waitUntil: "domcontentloaded" });
    await expect(page.getByText("Contract verified", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Attest incident", exact: true })).toBeDisabled();
    await page.getByRole("button", { name: "Connect reporter wallet", exact: true }).click();
    await expect(page.getByText("Connected:", { exact: false })).toBeVisible();
    await page.getByRole("button", { name: "Attest incident", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("did not match");
    expect(sent).toBe(0);
    tampered = false;
    await page.getByRole("button", { name: "Attest incident", exact: true }).click();
    await expect(page.getByRole("link", { name: "Inspect submitted transaction on BOTScan" })).toHaveAttribute("href", `https://scan.botchain.ai/tx/${openingTx}`);
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByRole("link", { name: "Inspect submitted transaction on BOTScan" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Connect reporter wallet", exact: true })).toBeDisabled();
    expect(sent).toBe(1);
    receiptState = "confirmed";
    await expect(page.getByRole("status")).toContainText("Confirmed on BOT Chain");
    await page.getByRole("button", { name: "Connect reporter wallet", exact: true }).click();
    await expect(page.getByRole("button", { name: "Attest incident", exact: true })).toBeDisabled();
    await page.getByRole("button", { name: "Attest recovery", exact: true }).click();
    await expect(page.getByRole("link", { name: "Inspect confirmed transaction on BOTScan" })).toHaveAttribute("href", `https://scan.botchain.ai/tx/${recoveryTx}`);
    await expect(page.getByRole("button", { name: "Attest recovery", exact: true })).toBeDisabled();
    expect(sent).toBe(2);
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) throw new Error(`Reports overflow at ${width}px`);
    if (errors.length) throw new Error(errors.join("; "));
    findings.push({ width, malformedTransactionRejected: true, pendingReloadNoResend: true, ownOpeningAndRecovery: true, exactlyTwoWalletRequests: true, overflow: false, errors });
    await context.close();
  }
} finally { await browser.close(); }
await mkdir("docs/evidence", { recursive: true });
const report = { checkedAt: new Date().toISOString(), base, fixture: true, note: "Mock wallet and API: no signing, broadcasts, or independent-user adoption.", findings };
await writeFile("docs/evidence/wallet-report-browser-fixtures.json", JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report));
