# Pulsegrid monitoring scheduler

Convex runs `monitor:run` every five minutes. The action calls the protected monitoring endpoint at `https://pulsegrid-psi.vercel.app/bot/api/monitor`, then invokes the private `reporter:run` action. Observations, incident evidence, transaction queue, and registry indexing stay in Pulsegrid's isolated BOT PostgreSQL schema.

**Current production state: automatic reporting disabled by the user.** `PULSEGRID_REPORTING_ENABLED=false`; `PULSEGRID_PRIVATE_KEY` has been removed from production. The reporter returns a successful `disabled` result before connecting, loading a signer or processing queued transactions. Scheduled RPC observations continue. Restoring automatic signing requires explicit authorization and reconfiguring both the flag and the authorized key. The prior controlled mainnet receipts and evidence remain historical records.

Production requires `PULSEGRID_MONITOR_SECRET`, matching the website's `CRON_SECRET`. `PULSEGRID_MONITOR_URL` defaults to the public BOT monitoring endpoint. The reporter requires its own private production `DATABASE_URL`, BOT network/schema/registry/deployment-block configuration, `PULSEGRID_PRIVATE_KEY`, and `PULSEGRID_REPORTING_ENABLED=true`. It only accepts the existing BOT registry, official RPC, and isolated `pulsegrid_bot_677` schema. The key must belong to the contract's immutable authorized reporter. It never belongs in the website environment or Git.

`PULSEGRID_REPORT_MAX_COST=0.05` limits each transaction's maximum fee in BOT. `PULSEGRID_REPORT_DAILY_MAX_COST=0.25` limits reserved maximum fees over a rolling 24 hours, including failed transactions. Reservations are retained in the timeline separately from public incident observations. The queue preserves signed bytes before broadcasting, verifies source evidence and calldata, reconciles receipts across runs, and shares the monitor's advisory lock. Internal Convex actions are not callable by anonymous website users.

From the repository root, `node scripts/configure-convex-reporter.mjs` prepares a mode-0600 ignored environment file using the verified local BOT worker configuration. Adding `--apply` installs these variables only on `sincere-hamster-832`, without printing secrets. Production code deployment remains a separate step.

Run `pnpm install`, configure the Convex project, then deploy with `pnpm deploy`. Inspect the cron and action executions in the Convex dashboard. Scheduled runs may be delayed; the website displays retained observation times and stale data.
