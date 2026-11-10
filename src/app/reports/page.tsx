import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { WalletReportsPanel } from "@/components/wallet-reports-panel";
import { getWalletReportOverview } from "@/lib/wallet-reports";
import { runtimeConfig } from "@/lib/env";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Wallet incident attestations", description: "Approved wallets review retained incident and recovery evidence and publish their own BOT Chain attestations." };
export default async function WalletReportsPage() {
  if (runtimeConfig().network !== "bot-mainnet") notFound();
  return <div className="page shell"><header className="page-head"><div><h1>Report with your wallet</h1><p className="lede">Review retained incident and recovery evidence, then publish your own attestation on BOT Chain. Your wallet signs each transaction and remains identified in the on-chain record.</p></div></header><WalletReportsPanel initial={await getWalletReportOverview()} /></div>;
}
