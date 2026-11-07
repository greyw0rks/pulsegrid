# Pulsegrid monitoring scheduler

Convex runs `monitor:run` every five minutes. The action calls the protected monitoring endpoint at `https://pulsegrid-psi.vercel.app/bot/api/monitor`. Observations, incident evidence, and registry indexing stay in Pulsegrid's isolated BOT PostgreSQL schema.

Production requires `PULSEGRID_MONITOR_SECRET`, matching the website's `CRON_SECRET`. `PULSEGRID_MONITOR_URL` defaults to the public BOT monitoring endpoint. The scheduler does not receive a deployment wallet key and does not submit transactions.

Run `pnpm install`, configure the Convex project, then deploy with `pnpm deploy`. Inspect the cron and action executions in the Convex dashboard. Scheduled runs may be delayed; the website displays retained observation times and stale data.
