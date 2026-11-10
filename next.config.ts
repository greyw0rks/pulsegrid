import type { NextConfig } from "next";

const basePath = process.env.PULSEGRID_BASE_PATH || "";
if (basePath !== "" && basePath !== "/bot") throw new Error("Unsupported Pulsegrid base path");
const config: NextConfig = {
  basePath,
  env: { NEXT_PUBLIC_PULSEGRID_BASE_PATH: basePath },
  poweredByHeader: false,
  devIndicators: false,
  experimental: { useTypeScriptCli: false },
  outputFileTracingIncludes: {
    '/': ['./docs/evidence/deployment-*.json'],
    '/review': ['./docs/evidence/deployment-*.json', './docs/evidence/wallet-registry-deployment-677.json'],
    '/reports': ['./docs/evidence/wallet-registry-deployment-677.json'],
    '/api/wallet-reports': ['./docs/evidence/wallet-registry-deployment-677.json'],
    '/api/wallet-reports/prepare': ['./docs/evidence/wallet-registry-deployment-677.json'],
    '/api/wallet-reports/receipt': ['./docs/evidence/wallet-registry-deployment-677.json'],
    '/registry': ['./docs/evidence/deployment-*.json'],
    '/api/deployment': ['./docs/evidence/deployment-*.json']
  },
  async rewrites() {
    return basePath ? [] : [
      { source: "/bot", destination: "https://pulsegrid-bot.vercel.app/bot" },
      { source: "/bot/:path*", destination: "https://pulsegrid-bot.vercel.app/bot/:path*" }
    ];
  },
  async headers() {
    return [{ source: "/(.*)", headers: [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "X-Frame-Options", value: "DENY" }
    ] }];
  }
};
export default config;
