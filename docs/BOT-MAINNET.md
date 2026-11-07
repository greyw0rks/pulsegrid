# BOT Chain deployment

- Website: https://pulsegrid-psi.vercel.app/bot
- Network: BOT Chain mainnet, chain ID 677
- Registry: `0x368d564dd8166d1967f21c7fbaaf87883ef85c83`
- Deployment transaction: `0xed72c57368a4d20ff60bb1658d524fd323aa1ac45274a59a2284ae237c4ad929`
- Confirmed block: 29441534
- Authorized reporter: `0xE79bB36b53835f0740BD4a9684F5C84d8fB9b52C`
- Deployment fee: 0.01098364 BOT
- Verified source: https://scan.botchain.ai/address/0x368d564dd8166d1967f21c7fbaaf87883ef85c83?tab=contract

The existing Portaldot pages and registry remain at the same website. Its `/bot` routes proxy a separately configured BOT deployment with base path `/bot` and database schema `pulsegrid_bot_677`. The existing Portaldot database records are preserved.

Convex project `greyw0rks:pulsegrid-monitor` schedules the protected monitoring endpoint every five minutes. Production deployment is `sincere-hamster-832`; scheduler source and deployment instructions are in `scheduler/`. This job retains RPC observations and indexes registry receipts. The deployment wallet key stays local; automated on-chain incident submission is not enabled by the website or scheduler.

The registry keeps its existing immutable single-reporter authorization. No additional wallet-count features were introduced. Successful deployment does not imply observed incidents, recovery attestations, or independent adoption. Genuine reports appear when their respective evidence and successful transactions exist.

Deployment, source verification, live checks, and browser captures are retained in `docs/evidence/bot-mainnet-*.json`, `docs/evidence/deployment-677-*.json`, and `docs/evidence/bot-ui/`.
