import { ImageResponse } from "next/og";
import { runtimeConfig } from "@/lib/env";
export const alt = "Pulsegrid — Know what failed. Prove what recovered.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export default function Image() {
  return new ImageResponse(<div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 70, background: "#11251b", color: "#edf6ef" }}>
    <div style={{ display: "flex", fontSize: 26 }}>PULSEGRID / {runtimeConfig().network === "bot-mainnet" ? "BOT CHAIN RPC MONITORING" : "PORTALDOT NODE OPERATIONS"}</div>
    <div style={{ display: "flex", flexDirection: "column", fontSize: 76, lineHeight: 1.06, letterSpacing: -4 }}><span>Know what failed.</span><span style={{ color: "#9cdcb5" }}>Prove what recovered.</span></div>
    <div style={{ display: "flex", fontSize: 22, color: "#a0b8aa" }}>Observe. Retain. Confirm.</div>
  </div>, size);
}
