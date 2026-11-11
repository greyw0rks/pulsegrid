# BOT Chain deployment

Review package: [BOT-REVIEW.md](BOT-REVIEW.md). Live incident/recovery review: https://pulsegrid-psi.vercel.app/bot/review. [Published BOT launch](https://x.com/Greyw0rks/status/2120488726468190656); [additional unused drafts](BOT-X-POSTS.md).

- Website: https://pulsegrid-psi.vercel.app/bot
- Network: BOT Chain mainnet, chain ID 677
- Registry: `0x368d564dd8166d1967f21c7fbaaf87883ef85c83`
- Deployment transaction: `0xed72c57368a4d20ff60bb1658d524fd323aa1ac45274a59a2284ae237c4ad929`
- Confirmed block: 29441534
- Authorized reporter: `0xE79bB36b53835f0740BD4a9684F5C84d8fB9b52C`
- Deployment fee: 0.01098364 BOT
- Verified source: https://scan.botchain.ai/address/0x368d564dd8166d1967f21c7fbaaf87883ef85c83?tab=contract

The existing Portaldot pages and registry remain at the same website. Its `/bot` routes proxy a separately configured BOT deployment with base path `/bot` and database schema `pulsegrid_bot_677`. The existing Portaldot database records are preserved.

Convex project `greyw0rks:pulsegrid-monitor` schedules the protected monitoring endpoint every five minutes. Production deployment is `sincere-hamster-832`; scheduler source and deployment instructions are in `scheduler/`. **Automatic on-chain reporting is currently disabled at the user's request.** `PULSEGRID_REPORTING_ENABLED=false`, and `PULSEGRID_PRIVATE_KEY` has been removed from the production environment. The scheduled private reporter returns `disabled` without loading a signer, connecting to the database, or processing the queue. RPC observations and registry indexing continue. The public website has no signing key.

When explicitly enabled and configured with its authorized signer, the reporter checks the deployed contract's authorized wallet, validates the retained source evidence, and reserves fees before broadcasting. Maximum fees are limited to 0.05 BOT per transaction and 0.25 BOT reserved over a rolling 24-hour window. Transactions retain their signed bytes before submission and reconcile successful receipts on subsequent runs. An advisory lock prevents overlapping monitor/reporter cycles. Low funds, RPC failures, evidence mismatches and exhausted retries remain explicit queue states. New incident evidence may still be retained and queued while signing is disabled; it is not automatically published.

The controlled BOT mainnet drill passed through the deployed Convex monitoring and reporting actions. Incident #1 opened in `0xee33697d340e3b5b431effde5f3e714785f829c18016106e461d8b8eff44c482` at block 29447273 and resolved in `0xc45051c97ba890a9215639c2df7c5cd767908dc3e67c95ddb60270b7f0b0b9fc` at block 29447336. Both receipts succeeded and their separate evidence hashes match the source documents and contract record. Actual combined gas cost was 0.00526666 BOT. The dedicated simulated endpoint is paused after completion; the official BOT RPC remains monitored separately. This is a controlled execution demonstration, not an official BOT outage or independent-user adoption.

Public incident: https://pulsegrid-psi.vercel.app/bot/incidents/145e6abe-5a87-469d-ada5-d17b252b0799

Run `node .local/run.mjs .local/worker.env node --import tsx scripts/bot-drill.ts` for a read-only drill preflight, adding `--submit` only for an authorized execution. The script retains one completed drill per registry and resumes its existing incident after interruption. Evidence is in `docs/evidence/bot-drill-*.json` and `docs/evidence/bot-drill/`.

The original registry keeps its immutable single-reporter authorization. An additional `MultiReporterIncidentRegistry` was deployed November 10 at `0xa906ff64af8bfbcd0408d793bfd13bfc2288cd4f`, with exact Solidity source verified on BOTScan. Its owner can approve or revoke reporters; each wallet opens and resolves its own reports. Revocation prevents new reports while allowing a reporter to resolve its existing reports. Four participant wallets supplied and confirmed by the owner are approved, alongside the existing owner wallet.

Participant instructions: [BOT-PARTICIPANT-GUIDE.md](BOT-PARTICIPANT-GUIDE.md). Reporting page: https://pulsegrid-psi.vercel.app/bot/reports. Each participant reviews retained source evidence and approves its own zero-value transaction plus gas. Historical drill evidence preserves the original monitor and observation times. A wallet attestation does not represent a fresh outage or another monitor's observations.

At the user's request, all four participant wallets received 0.025 BOT each for gas, with four successful transfer receipts retained in `docs/evidence/participant-gas-grants-677.json`. Total grants: 0.1 BOT; transfer fees: 0.00168 BOT. Deployment fee: 0.015646 BOT. Deployment and gas transfers are excluded from core-product counts. No participant reports have been signed on behalf of those wallets.

Deployment, source verification, live checks, and browser captures are retained in `docs/evidence/bot-mainnet-*.json`, `docs/evidence/deployment-677-*.json`, and `docs/evidence/bot-ui/`.
