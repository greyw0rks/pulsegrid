# Hosted testnet MVP

Pulsegrid uses a public Next.js landing page and dashboard on Vercel, an isolated Neon Free PostgreSQL database, and the verified Portaldot V3 testnet registry. Genuine retained observations and the controlled incident/recovery drill were copied to hosted storage; their original evidence documents and receipts remain available.

The GitHub Actions monitor workflow probes configured endpoints every five minutes and reconciles registry transactions with the normal worker. This is scheduled monitoring: Actions runs can be delayed, so this deployment does not promise continuous or second-by-second checks. The dashboard reports retained observation times and monitor freshness.

Set the workflow's `DATABASE_URL` secret to the direct Neon connection string and `PULSEGRID_PRIVATE_KEY` to Pulsegrid's dedicated reporter. Session advisory locks require the direct connection, rather than a transaction pooler. Vercel uses the pooled database URL and its private operator token. The web deployment does not receive the reporter key.

The production deployment disables controlled drills. Its operator page requires authentication before endpoint registration or pause/resume; allowed hosts are configured server-side. Proof JSON files needed by `/registry` and `/api/deployment` are explicitly included in Next.js server traces.

Review `docs/evidence/hosted-storage.json`, the retained deployment proof, and the controlled testnet drill record for evidence. Credentials, wallet passwords, and signed transaction bytes remain in ignored `.local/` files.
