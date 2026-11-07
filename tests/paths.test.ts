import { afterEach, expect, it, vi } from "vitest";
import { appPath } from "../src/lib/paths";
afterEach(()=>vi.unstubAllEnvs());
it("keeps BOT operator requests and proof downloads on the BOT path",()=>{
  vi.stubEnv("NEXT_PUBLIC_PULSEGRID_BASE_PATH","/bot");
  expect(appPath("/api/overview")).toBe("/bot/api/overview");
  expect(appPath("/api/deployment")).toBe("/bot/api/deployment");
});
it("preserves existing root requests",()=>{
  vi.stubEnv("NEXT_PUBLIC_PULSEGRID_BASE_PATH","");
  expect(appPath("/api/overview")).toBe("/api/overview");
});
