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

Convex project `greyw0rks:pulsegrid-monitor` schedules the protected monitoring endpoint every five minutes. Production deployment is `sincere-hamster-832`; scheduler source and deployment instructions are in `scheduler/`. After retaining observations, the cron invokes the private `reporter:run` action to process the durable incident/recovery queue. The reporter key and isolated BOT database connection are private Convex production variables; the public website has no signing key.

The reporter checks the deployed contract's authorized wallet, validates the retained source evidence, and reserves fees before broadcasting. Maximum fees are limited to 0.05 BOT per transaction and 0.25 BOT reserved over a rolling 24-hour window. Transactions retain their signed bytes before submission and reconcile successful receipts on subsequent runs. An advisory lock prevents overlapping monitor/reporter cycles. Low funds, RPC failures, evidence mismatches and exhausted retries remain explicit queue states.

The controlled BOT mainnet drill passed through the deployed Convex monitoring and reporting actions. Incident #1 opened in `0xee33697d340e3b5b431effde5f3e714785f829c18016106e461d8b8eff44c482` at block 29447273 and resolved in `0xc45051c97ba890a9215639c2df7c5cd767908dc3e67c95ddb60270b7f0b0b9fc` at block 29447336. Both receipts succeeded and their separate evidence hashes match the source documents and contract record. Actual combined gas cost was 0.00526666 BOT. The dedicated simulated endpoint is paused after completion; the official BOT RPC remains monitored separately. This is a controlled execution demonstration, not an official BOT outage or independent-user adoption.

Public incident: https://pulsegrid-psi.vercel.app/bot/incidents/145e6abe-5a87-469d-ada5-d17b252b0799

Run `node .local/run.mjs .local/worker.env node --import tsx scripts/bot-drill.ts` for a read-only drill preflight, adding `--submit` only for an authorized execution. The script retains one completed drill per registry and resumes its existing incident after interruption. Evidence is in `docs/evidence/bot-drill-*.json` and `docs/evidence/bot-drill/`.

The registry keeps its existing immutable single-reporter authorization. No additional wallet-count features were introduced. Successful deployment does not imply observed incidents, recovery attestations, or independent adoption. Genuine reports appear when their respective evidence and successful transactions exist.

Deployment, source verification, live checks, and browser captures are retained in `docs/evidence/bot-mainnet-*.json`, `docs/evidence/deployment-677-*.json`, and `docs/evidence/bot-ui/`.
