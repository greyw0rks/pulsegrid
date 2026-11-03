"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, ExternalLink } from "lucide-react";

export function PrimaryNav() {
  const pathname = usePathname();
  return <nav className="primary-nav" aria-label="Primary navigation">
    {[{ href: "/dashboard", label: "Dashboard" }, { href: "/registry", label: "Registry" }, { href: "/operator", label: "Operator" }].map(item =>
      <Link key={item.href} href={item.href} aria-current={pathname === item.href ? "page" : undefined}>
        {item.href === "/dashboard" ? <Activity aria-hidden="true" size={15} /> : null}{item.label}
      </Link>)}
    <a href="https://node-console.portaldot.dev/" target="_blank" rel="noreferrer">Node console <ExternalLink aria-hidden="true" size={13} /></a>
  </nav>;
}
