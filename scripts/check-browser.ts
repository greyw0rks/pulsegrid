import { mkdir } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import { keccak256, stringToHex } from "viem";

export async function checkBrowser(base: string, token: string, incidentId: string, openingHash: string) {
  if (!["127.0.0.1", "localhost"].includes(new URL(base).hostname)) throw new Error("Browser verification requires a local preview");
  await mkdir("docs/evidence/ui", { recursive: true });
  const errors: string[] = [];
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
    const page = await context.newPage();
    page.setDefaultNavigationTimeout(90000);
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(`${base}/dashboard`);
    await expect(page.getByRole("heading", { name: "Portaldot endpoint pulse" })).toBeVisible();
    await expect(page.getByText("Local integration chain · 31337", { exact: true })).toBeVisible();
    await page.screenshot({ path: "docs/evidence/ui/local-drill-overview-desktop.png", fullPage: true });
    await page.goto(`${base}/incidents/${incidentId}`);
    await expect(page.getByRole("heading", { name: "Transition timeline" })).toBeVisible();
    await expect(page.getByText("Controlled drill", { exact: true })).toBeVisible();
    await page.goto(`${base}/evidence/${openingHash}`);
    await expect(page.getByRole("heading", { name: "Digest verified" })).toBeVisible();
    const source = await (await context.request.get(`${base}/api/evidence/${openingHash}`)).text();
    if (keccak256(stringToHex(source)) !== openingHash) throw new Error("Downloaded evidence digest does not match");
    await page.goto(`${base}/registry`);
    await expect(page.locator(".data-table tbody tr")).toHaveCount(2);
    await page.goto(`${base}/operator`);
    await expect(page.getByRole("button", { name: "Register endpoint", exact: true })).toBeDisabled();
    await page.getByLabel("Operator token", { exact: true }).fill("incorrect-token");
    await page.getByRole("button", { name: "Unlock controls", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Action needs attention" })).toContainText("token was not accepted");
    await page.getByLabel("Operator token", { exact: true }).fill(token);
    await page.getByRole("button", { name: "Unlock controls", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Monitoring controls", exact: true })).toBeFocused();
    const original = page.locator(".operator-endpoint").filter({ has: page.getByRole("heading", { name: "Controlled local recovery drill", exact: true }) });
    await original.getByRole("button", { name: "Pause monitoring", exact: true }).click();
    await expect(original.locator(".status")).toHaveText("paused");
    await original.getByRole("button", { name: "Resume monitoring", exact: true }).click();
    await expect(original.getByRole("button", { name: "Pause monitoring", exact: true })).toBeEnabled();
    await page.getByLabel("Endpoint name", { exact: true }).fill("Browser registration fixture");
    await page.getByLabel("RPC URL", { exact: true }).fill("https://foreign.invalid");
    await page.getByRole("button", { name: "Register endpoint", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Action needs attention" })).toContainText("allowlist");
    await page.getByLabel("RPC URL", { exact: true }).fill("https://test-evm-rpc-v3.portaldot.dev");
    await page.getByRole("button", { name: "Register endpoint", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Browser registration fixture", exact: true })).toBeVisible();
    await expect(page.getByRole("status")).toContainText("Endpoint registered");
    await page.getByRole("button", { name: "Lock controls", exact: true }).click();
    await expect(page.getByLabel("Operator token", { exact: true })).toHaveValue("");
    await expect(page.getByRole("button", { name: "Register endpoint", exact: true })).toBeDisabled();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: "docs/evidence/ui/local-drill-operator-desktop.png", fullPage: true });
    for (const width of [390, 360]) {
      await page.setViewportSize({ width, height: 844 });
      for (const [name, path] of [["overview", "/dashboard"], ["operator", "/operator"], ["incident", `/incidents/${incidentId}`], ["evidence", `/evidence/${openingHash}`]] as const) {
        await page.goto(base + path);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        if (!await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)) throw new Error(`${name} overflows at ${width}px`);
        await page.screenshot({ path: `docs/evidence/ui/local-drill-${name}-${width}.png`, fullPage: true });
      }
    }
    const unauthorized = await context.request.post(`${base}/api/endpoints`, { data: {} });
    if (unauthorized.status() !== 401) throw new Error("Unauthenticated endpoint mutation was not rejected");
    const foreignOrigin = await context.request.get(`${base}/api/operator`, { headers: { Authorization: `Bearer ${token}`, Origin: "https://foreign.invalid" } });
    if (foreignOrigin.status() !== 401) throw new Error("Foreign-origin operator request was not rejected");
    if (errors.length) throw new Error(`Browser runtime errors: ${errors.join("; ")}`);
    return { status: "passed", widths: [1440, 390, 360], operator: "authorization, allowlist, register, pause/resume, lock, keyboard focus", evidenceDownloadVerified: true, errors };
  } finally { await browser.close(); }
}
