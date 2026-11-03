# Pulsegrid

An independent Portaldot RPC monitor with retained observations, verifiable incident evidence, and a Solidity registry for opening and recovery attestations.

The local dashboard runs at **http://localhost:3023**. Atlas is available at **http://localhost:3005**.

## Run locally

Requires Node 22.13+, pnpm, PostgreSQL, and Foundry for contract checks.

```sh
pnpm install
pnpm local:setup
pnpm build
pnpm local:up
```

`local:setup` preserves existing configuration and data. `local:up` starts the worker and web server as persistent local processes. Logs and PID files are in `.local/runtime/`. Use `pnpm local:stop` before rebuilding a running production preview, then `pnpm local:up` to restart it. The database remains running when the preview stops.

Open `/operator` and enter the token configured in `.env.local` to register allowed endpoints or pause/resume monitoring. The token stays in page memory. Configure additional hosts in `PULSEGRID_ALLOWED_HOSTS` on the server.

## Verified public deployment

- Network: Portaldot V3 testnet, chain ID **420420777** (`0x190f1ca9`).
- Registry: `0x9c0d5b9cca49f69ffc7384d5da263689a21f7e22`.
- Reporter: `0xC156551F786270C8bb3c748c9Bee68FaC1bdC9DB`.
- Deployment transaction: `0x57cffb9de823940f9b0945c1297dce73e38ec8dd1f7453b8b0c6b962fa537479`, block **303901**.
- Native genesis: `0xd4f9acbcf7f52388d8b095abe3c198d19fc510e0343e643e87cfbccb155283bd`.

The `/registry` page checks the retained deployment receipt, runtime code hash, and authorized reporter against the current RPC. `/api/deployment` downloads this proof with its verification time. Opening and recovery events appear separately after their receipts and evidence match.

Public evidence lives in `docs/evidence/`; credentials and retained deployment transaction bytes live in ignored `.local/` files. Keep `docs/evidence/` available to the server when packaging a self-hosted deployment.

The controlled public testnet drill also passed: incident #1 opened at block 303974 and recovered at block 303980. Both genuine receipts and distinct canonical source documents are retained in `docs/evidence/testnet-drill-0x9c0d5b9cca49f69ffc7384d5da263689a21f7e22.json`. The drill endpoint is paused; enabled official endpoints continue to be monitored.

## Funding and deployment

`pnpm wallet:prepare` creates a dedicated EVM reporter without overwriting an existing wallet. A funded native account can transfer tPOT to that reporter's Revive fallback AccountId32. The funding command defaults to read-only preflight:

```sh
pnpm wallet:fund --source <native-public-address> --wallet <encrypted-wallet-json> --password-file <local-password-file> --amount 300
```

Append `--submit` to sign and submit the reviewed transfer. The script verifies the signer, both network identities, destination mapping, spendable balance, and keep-alive reserve, and creates an exclusive public funding record to prevent accidental duplicate funding. Native tPOT has 14 decimals; the EVM interface represents balances with 18 decimals.

`pnpm deploy:contract` caps the testnet transaction's maximum gas fee at 220 tPOT by default (`PULSEGRID_DEPLOYMENT_MAX_COST` can override it), retains signed bytes before submission, and reuses them on restart. Set `PULSEGRID_REGISTRY_ADDRESS` and `PULSEGRID_DEPLOYMENT_BLOCK` from the verified result before restarting the worker. A reverted retained transaction requires inspection rather than an automatic new deployment.

## Validation

```sh
pnpm test
pnpm test:contracts
pnpm lint
pnpm build
pnpm test:e2e -- --browser
```

Stop the normal worker before running the isolated local end-to-end check; both use the database's single-worker advisory lock. That check uses ephemeral Anvil chain **31337** and a temporary PostgreSQL schema. It tests detection, distinct opening/recovery documents, receipt reconciliation after a worker restart, browser controls, evidence downloads, and responsive layouts. It never uses the public testnet reporter.

`pnpm prove:drill` estimates a separate, explicitly simulated public testnet drill. Append `--submit` to run it once for the configured contract through the actual worker. It reserves twice the opening estimate for opening and recovery, rejects a reserve over 75 tPOT or the current balance, preserves both receipts and source evidence, and pauses the drill endpoint after successful recovery.

An attestation proves what the authorized reporter submitted. It does not independently establish an objective network outage. Controlled drills are labeled in their observations, evidence, and incident detail.
