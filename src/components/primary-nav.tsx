"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, ExternalLink } from "lucide-react";

export function PrimaryNav({ externalHref = "https://node-console.portaldot.dev/", externalLabel = "Node console" }: { externalHref?: string; externalLabel?: string }) {
  const pathname = usePathname();
  return <nav className="primary-nav" aria-label="Primary navigation">
    {[{ href: "/dashboard", label: "Dashboard" }, { href: "/registry", label: "Registry" }, { href: "/operator", label: "Operator" }, ...(externalLabel === "BOTScan" ? [{ href: "/reports", label: "Report" }] : [])].map(item =>
      <Link key={item.href} href={item.href} aria-current={pathname === item.href ? "page" : undefined}>
        {item.href === "/dashboard" ? <Activity aria-hidden="true" size={15} /> : null}{item.label}
      </Link>)}
    {externalLabel === "BOTScan" ? <a href="https://pulsegrid-psi.vercel.app">Portaldot</a> : <Link href="/bot">BOT Chain</Link>}
    <a href={externalHref} target="_blank" rel="noreferrer">{externalLabel} <ExternalLink aria-hidden="true" size={13} /></a>
  </nav>;
}
