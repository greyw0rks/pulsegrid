# Development record

## November 7, 2026

- Deployed the unchanged single-reporter IncidentRegistry to BOT Chain mainnet (677) from the supplied funded wallet. Contract `0x368d564dd8166d1967f21c7fbaaf87883ef85c83`, transaction `0xed72c57368a4d20ff60bb1658d524fd323aa1ac45274a59a2284ae237c4ad929`, block 29441534, paid fee 0.01098364 BOT. The successful receipt, runtime code, authorized reporter, and BOTScan source verification match the retained deployment record.
- Kept the existing website address. Added BOT pages at `https://pulsegrid-psi.vercel.app/bot`, backed by isolated BOT configuration and database schema; existing Portaldot registry, records, and scheduled worker remain separate. Kept operator requests and evidence downloads under the correct network path and made the navigation fit mobile screens.
- At the user's request, deployed the five-minute monitoring job to the separate Convex project `pulsegrid-monitor`, production `sincere-hamster-832`. The protected endpoint retains observations and indexes registry events; the web deployment and scheduler do not receive the funded wallet key.
- Validation: 27 application checks, 15 Solidity checks including fuzzing, TypeScript, production builds for both web deployments, and Convex production typecheck passed. ESLint has no errors and retains one pre-existing warning in the local E2E script. Anonymous live contract proof, operator/monitor authorization, desktop/390px/360px layouts, network navigation, evidence download, and preservation of both original Portaldot confirmed events passed. Live evidence is retained under `docs/evidence/`.

## November 3, 2026

- Published the repository to GitHub and connected it to the Vercel project. The public landing page and dashboard are hosted at https://pulsegrid-psi.vercel.app; the unsuffixed alias was unavailable.
- Migrated genuine monitoring history and the successful controlled testnet drill into an isolated Neon Free database. Vercel uses pooled connections; the scheduled Actions worker uses a direct connection for its session advisory lock. Reporter credentials stay out of the web deployment.
- Added production packaging for retained deployment proofs, explicit UTC timestamps to fix server/browser timezone hydration, and an operator interval minimum matching five-minute hosted scheduling. Application tests now pass 23 checks; ESLint reports no errors.
- Final public production review passed on the GitHub-deployed release at 1440/390/360px in Africa/Lagos: landing, dashboard, registry and operator pages, healthy Neon-backed APIs, live deployment proof and zero browser runtime errors. The first GitHub Actions hosted monitor run (41619665926) also completed successfully. Reports and screenshots are retained in `docs/evidence/hosted-ui.json` and `docs/evidence/ui/hosted-*`.

- Resumed the existing Pulsegrid implementation and restored the production preview and persistent worker on localhost:3023 with a private local PostgreSQL instance.
- Verified Atlas's local dashboard on localhost:3005 and its MCP session interface.
- Verified the user-supplied native account held 500 tPOT on Portaldot V3; unlocked the supplied encrypted sr25519 wallet using a local password file without printing the password or key.
- Added native funding preflight/submission with signer identity checks, exact 14-decimal amounts, a 300 tPOT operation limit, fee and keep-alive reserves, pinned genesis, finalized dispatch-event retention, and exclusive records to prevent duplicate transfers. Four meaningful funding checks pass.
- Transferred 300 tPOT to the dedicated reporter's Revive fallback account. Native transaction `0x6c1da711f633dd8a64dcf63570b1d7faf979cd3ebeebacd0fcce33f6e2d2202a` finalized successfully; EVM spending balance was independently observed as 299.9 tPOT.
- Added restart-safe contract deployment that retains signed bytes before broadcast, reuses the same transaction on retry, and enforces a maximum fee budget (220 tPOT by default on testnet).
- Deployed registry `0x9c0d5b9cca49f69ffc7384d5da263689a21f7e22` on chain 420420777 at block 303901. Genuine deployment transaction `0x57cffb9de823940f9b0945c1297dce73e38ec8dd1f7453b8b0c6b962fa537479` succeeded; runtime code and immutable reporter match. Receipt-reported fee: 191.75681099291157696 tPOT.
- Configured the verified registry and deployment block, pinned the observed native genesis in configuration and the existing native endpoint, and retained all earlier observations.
- Added a registry deployment panel and downloadable proof that rechecks the receipt, block identity, code hash, and authorized reporter against the current RPC. Added active navigation, a short summary entrance, finite subtle heartbeat motion, tactile button presses, and reduced-motion support.
- Added a priced, one-per-registry testnet drill using a separate simulated endpoint, the actual monitoring worker, and distinct retained source evidence. Its gas-estimation values are never presented as observations or receipts.
- Application checks (22 tests), Solidity checks (15 tests including fuzzing), ESLint, and production build passed. Browser and public drill verification are recorded below when completed.
- The complete isolated local end-to-end and browser check passed again: mined opening receipt reconciliation after a worker restart, no duplicate events, distinct recovery evidence, authorization and allowlist enforcement, registration, pause/resume, keyboard focus, and 1440/390/360px layouts.
- The actual public testnet controlled drill passed through the normal worker. Incident #1 opened in transaction `0x9e23d94eec00311d184275f50330a7a203c591cd3159d915773f7ba7fc0663ec` at block 303974 and recovered in `0x1f2e422c28e5b433bdb28d841810c4a386fd3ba58faf3ce02830e1f29e1d0c35` at block 303980. Both successful receipts, matching events, and distinct source documents are retained. The simulated endpoint was paused after success; official RPC observations remained independent. Reporter balance after the drill: 77.367262848516051185 tPOT.
- Read-only browser verification of the running testnet preview passed at 1440/390/320px, including active navigation, verified deployment download, disabled unauthenticated controls, dark theme, reduced-motion behavior, and no browser runtime errors. Fixed the summary denominator to include only enabled endpoints, so a paused drill does not lower current monitored health.

## October 28, 2026

- Began a new Pulsegrid implementation for Portaldot Node Operations & Tooling.
- Stopped unused HyperFrames previews on ports 3002 and 3004 and verified all their subprocesses exited.
- Independently queried the updated EVM RPC: chain ID is 420420777, hexadecimal `0x190f1ca9`. Corrected the erroneous hexadecimal value in the supplied proposal.
- Verified `eth_blockNumber`, `eth_getBlockByNumber`, and `web3_clientVersion` respond. These reads do not prove funded transaction execution or contract deployment.
- Selected a small Solidity registry with an immutable authorized reporter, unique report keys, one open incident per endpoint, immutable opening evidence, and separate recovery evidence.
- Compiler target starts at Solidity 0.8.28 / Paris to avoid requiring PUSH0; actual Portaldot deployment compatibility remains to be verified.
- Testnet funding and a real deployment receipt remain pending. Local-chain integration must be labeled separately.
- Completed the first dashboard, incident detail, registry event, evidence verification, and operator API surfaces.
- Restored the pinned pnpm toolchain and verified TypeScript, ESLint, the production Next.js build, 9 application tests, and 15 Solidity tests.
- Passed the local end-to-end drill on ephemeral Anvil chain ID 31337: an incident opened, both signed transactions and distinct evidence documents were retained, recovery was confirmed, and two matching registry events were indexed.
- Extended the local drill to simulate a crash after an opening transaction is mined but before its receipt is retained locally. The restarted worker reconciles the persisted hash and receipt without duplicating the chain event, then confirms recovery.
