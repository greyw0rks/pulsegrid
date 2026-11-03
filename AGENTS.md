# Pulsegrid

- Prefix shell commands with `rtk`; use `rtk proxy` when exact output is needed.
- Monitor configured RPC endpoints. The topology is illustrative and does not represent discovered validators.
- Keep observed incidents, submitted transactions, confirmed receipts, and observed recovery distinct.
- Do not fabricate telemetry, deployment addresses, receipts, or explorer URLs.
- Testnet chain ID is 420420777 (`0x190f1ca9`). Local Anvil is a separate, explicitly labeled network.
- Credentials belong in ignored `.env` or `.local/` files. Never reuse another project's signer.
- Evidence hashes are Keccak-256 over canonical UTF-8 JSON; source documents must remain retrievable.
- Contract transitions and worker restart/retry behavior require meaningful tests.
- Record changes in `docs/development-log.md`; retain the genuine Git history.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
