import { chromium, expect as baseExpect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";

const base = "https://pulsegrid-psi.vercel.app/bot";
const expect = baseExpect.configure({ timeout: 30000 });
await mkdir("docs/evidence/bot-review-ui", { recursive: true });
const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
const findings = [];
try {
  for (const width of [1280, 390, 360]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(base, { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Know what failed");
    await expect(page.getByText("Pulsegrid is an independent project", { exact: false })).toBeVisible();
    await expect(page.getByRole("link", { name: "BOT Chain", exact: true }).first()).toHaveAttribute("href", "https://botchain.ai");
    await expect(page.getByRole("link", { name: "BOTScan", exact: true }).first()).toHaveAttribute("href", "https://scan.botchain.ai");
    await page.getByRole("link", { name: "Review the mainnet flow", exact: true }).click();
    await expect(page).toHaveURL(base + "/review");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Pulsegrid on BOT Chain");
    await expect(page.getByText("Contract verified", { exact: true })).toBeVisible();
    await expect(page.getByText("Confirmed receipt retained", { exact: true })).toHaveCount(2);
    await expect(page.locator("main a[href^='https://scan.botchain.ai/tx/']")).toHaveCount(2);
    await expect(page.getByText("The review requires at least five successful core transactions across three wallets.", { exact: false })).toBeVisible();
    await expect(page.getByRole("link", { name: "Download canonical JSON", exact: true })).toHaveCount(2);
    const jsonHref = await page.getByRole("link", { name: "Download canonical JSON", exact: true }).first().getAttribute("href");
    if (!jsonHref?.startsWith("/bot/api/evidence/")) throw new Error("Evidence URL escaped BOT base path");
    const evidenceResponse = await page.request.get("https://pulsegrid-psi.vercel.app" + jsonHref);
    if (!evidenceResponse.ok() || !(await evidenceResponse.json()).simulated) throw new Error("Public controlled evidence unavailable");
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) throw new Error(`Review page overflows at ${width}px`);
    await page.screenshot({ path: `docs/evidence/bot-review-ui/review-${width}.png`, fullPage: true });
    await page.getByRole("link", { name: "Inspect the complete incident", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Controlled BOT mainnet recovery drill");
    await expect(page.getByText("Controlled drill", { exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Inspect source", exact: true }).first().click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Digest verified");
    if (errors.length) throw new Error(`Browser errors: ${errors.join("; ")}`);
    findings.push({ width, landingReviewLink: true, externalNetworkLinks: true, twoReceiptLinks: true, reporterRestrictionVisible: true,
      basePathPreserved: true, incidentNavigation: true, evidenceDownload: true, evidenceDigestVerified: true, overflow: false, errors });
    await page.close();
  }
} finally { await browser.close(); }
const report = { checkedAt: new Date().toISOString(), website: base, review: base + "/review", readOnly: true, browser: findings };
await writeFile("docs/evidence/bot-review-ui.json", JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
