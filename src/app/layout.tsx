import type { Metadata } from "next";
import Link from "next/link";
import { RadioTower } from "lucide-react";
import { PrimaryNav } from "@/components/primary-nav";
import "@fontsource-variable/ibm-plex-sans/wght.css";
import "@fontsource/ibm-plex-mono/latin-400.css";
import "@fontsource/ibm-plex-mono/latin-500.css";
import "@fontsource/ibm-plex-mono/latin-600.css";
import "@fontsource/ibm-plex-mono/latin-700.css";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.PULSEGRID_SITE_URL || "https://pulsegrid.vercel.app"),
  title: { default: "Pulsegrid", template: "%s | Pulsegrid" },
  description: "Portaldot RPC monitoring with verifiable incident and recovery evidence",
  robots: { index: false, follow: false }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main">Skip to content</a>
        <header className="topbar">
          <div className="shell topbar-inner">
            <Link className="brand" href="/" aria-label="Pulsegrid home">
              <span className="brand-mark"><RadioTower aria-hidden="true" size={17} strokeWidth={1.8} /></span>
              <span>Pulsegrid</span>
            </Link>
            <PrimaryNav />
          </div>
        </header>
        <main id="main">{children}</main>
        <footer className="site-footer">
          <div className="shell footer-inner">
            <span>Independent monitor observations</span>
            <span>On-chain records attest reports, not objective outages</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
