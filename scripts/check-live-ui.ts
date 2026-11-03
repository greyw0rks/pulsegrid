import { mkdir, writeFile } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";

const base = process.argv[2] || "http://127.0.0.1:3023";
if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname)) throw new Error("Use the local Pulsegrid preview");
await mkdir("docs/evidence/ui", { recursive: true });
const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
const errors: string[] = [];
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: "light", reducedMotion: "reduce" });
  const page = await context.newPage();
  page.setDefaultNavigationTimeout(60000);
  page.on("pageerror", error => errors.push(error.message));
  const proofResponse = await context.request.get(`${base}/api/deployment`);
  const proof = await proofResponse.json();
  if (proof.state !== "verified" || proof.chainId !== 420420777) throw new Error("Public testnet deployment proof did not verify");
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
    for (const [name, path] of [["landing", "/"], ["overview", "/dashboard"], ["registry", "/registry"], ["operator", "/operator"]]) {
      await page.goto(base + path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      if (path === "/registry") {
        await expect(page.getByText("Verified on chain", { exact: true })).toBeVisible();
        await expect(page.locator('.primary-nav a[aria-current="page"]')).toHaveText("Registry");
      }
      if (!await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)) throw new Error(`${name} overflows at ${width}px`);
      if (path === "/dashboard") {
        await expect(page.locator(".summary-cell").first()).toHaveCSS("animation-name", "none");
        await expect(page.getByText("Portaldot testnet · 420420777", { exact: true })).toBeVisible();
      }
      if (path === "/operator") await expect(page.getByRole("button", { name: "Register endpoint", exact: true })).toBeDisabled();
      await page.screenshot({ path: `docs/evidence/ui/testnet-${name}-${width}.png`, fullPage: true });
    }
  }
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "no-preference" });
  await page.goto(`${base}/dashboard`);
  await expect(page.locator(".summary-cell").first()).toHaveCSS("animation-name", "summary-arrival");
  await page.screenshot({ path: "docs/evidence/ui/testnet-overview-dark-320.png", fullPage: true });
  if (errors.length) throw new Error(`Browser errors: ${errors.join("; ")}`);
  const report = { checkedAt: new Date().toISOString(), status: "passed", base, chainId: proof.chainId, deploymentVerified: true,
    widths: [1440, 390, 320], reducedMotionVerified: true, darkThemeVerified: true, browserErrors: errors,
    note: "Read-only verification of the running public testnet dashboard; no operator changes or signed transactions." };
  await writeFile("docs/evidence/testnet-ui.json", `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report));
} finally { await browser.close(); }
