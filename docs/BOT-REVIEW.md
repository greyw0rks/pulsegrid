# BOT Chain review delivery

Updated November 10, 2026. The original incident/recovery proof remains available. An additional registry now supports approved participant wallets, and four owner-confirmed participant wallets have received BOT for gas. Participant core-action receipts and published social evidence still need to be supplied and verified for the full review checklist.

## Working application and evidence

| Deliverable | Link or status |
| --- | --- |
| BOT Chain application | https://pulsegrid-psi.vercel.app/bot |
| Review page | https://pulsegrid-psi.vercel.app/bot/review |
| Complete incident and recovery | https://pulsegrid-psi.vercel.app/bot/incidents/145e6abe-5a87-469d-ada5-d17b252b0799 |
| Verified mainnet contract | https://scan.botchain.ai/address/0x368d564dd8166d1967f21c7fbaaf87883ef85c83?tab=contract |
| Incident attestation | https://scan.botchain.ai/tx/0xee33697d340e3b5b431effde5f3e714785f829c18016106e461d8b8eff44c482 |
| Recovery attestation | https://scan.botchain.ai/tx/0xc45051c97ba890a9215639c2df7c5cd767908dc3e67c95ddb60270b7f0b0b9fc |
| BOT Chain website link | https://botchain.ai — present on the live BOT landing page and footer |
| BOTScan website link | https://scan.botchain.ai — present on the live BOT landing page and footer |
| Personal X profile | https://x.com/Greyw0rks — used by existing project posts; confirm preferred review profile |
| Mainnet launch announcement | Draft: [BOT-X-POSTS.md](BOT-X-POSTS.md); publishing and public URL pending |
| Five original X posts within 30 days | Five additional original drafts prepared; five qualifying published URLs have not been supplied or verified |
| Participant reporting | https://pulsegrid-psi.vercel.app/bot/reports; [participant guide](BOT-PARTICIPANT-GUIDE.md) |
| Verified wallet-reporting registry | https://scan.botchain.ai/address/0xa906ff64af8bfbcd0408d793bfd13bfc2288cd4f?tab=contract |
| Four participant gas grants | 0.025 BOT each; [successful transfer receipts](evidence/participant-gas-grants-677.json); excluded from core-action counts |
| Five successful core transactions across three wallets | **Unmet pending participant reports:** two verified controlled-drill core transactions, one sender wallet |

Both product receipts succeeded. The transaction inputs, events, contract state, BOTScan records, and canonical evidence hashes match. These are controlled execution evidence. The simulated failure does not establish an actual BOT RPC outage or independent adoption. Deployment transactions are excluded from the core-product count.

Fresh read-only proof: [bot-review-2026-11-09.json](evidence/bot-review-2026-11-09.json). Reproduce with `node --import tsx scripts/verify-bot-review.ts`.

## Independent project description

Pulsegrid is an independent RPC monitoring and recovery attestation project. It retains endpoint health checks, incident evidence, and separate recovery evidence, then links authorized reports to verifiable on-chain receipts. Its BOT Chain mainnet integration extends the existing Portaldot project and preserves its original deployment.

## Exact reporter limitation

The deployed registry's `authorizedReporter` is the immutable address `0xE79bB36b53835f0740BD4a9684F5C84d8fB9b52C`. Both `openIncident` and `resolveIncident` use `onlyReporter`. Other callers revert with `UnauthorizedReporter()`. The verified source has no function to add or rotate reporters. Fresh read-only `eth_call` simulations confirmed this rejection for both methods; simulations are not transactions and do not count toward the review requirement.

Automatic on-chain reporting remains disabled at the owner's request. Five-minute RPC observations and receipt indexing continue. No additional reports were generated for this review.

On November 10, the owner confirmed participant wallets and requested a total of four participant addresses. A separately deployed registry now allows those approved wallets to attest the retained source evidence and resolve only their own reports. Exact Solidity source, deployment, owner, runtime code hash, and reporter permissions were verified. User-authorized gas grants succeeded for all four wallets. Those grants do not establish actual product usage, and the participants must approve their own reports; on-chain records alone cannot verify their independence.

## Reviewer reply ready to send

Thanks for the checklist. Pulsegrid's BOT Chain app and complete incident/recovery proof are ready now:

App and review evidence: https://pulsegrid-psi.vercel.app/bot/review

Incident: https://scan.botchain.ai/tx/0xee33697d340e3b5b431effde5f3e714785f829c18016106e461d8b8eff44c482

Recovery: https://scan.botchain.ai/tx/0xc45051c97ba890a9215639c2df7c5cd767908dc3e67c95ddb60270b7f0b0b9fc

Both receipts succeeded and match the retained evidence. These are labelled controlled mainnet drill transactions. The website links to BOT Chain and BOTScan and includes Pulsegrid's independent project description.

The original registry has one immutable reporter. We added a verified wallet-reporting registry so approved participants can review the retained evidence and submit their own incident and recovery attestations. Four participant wallets confirmed by the owner have received BOT for gas. Current verified core-action evidence remains the original two transactions from one wallet until participant reports are confirmed; deployment and gas-grant transactions are excluded.

The launch announcement is prepared. I'll send its published URL, five qualifying original-post links, and participant receipt URLs once available. Technical delivery is ready; completion of the full review checklist depends on participants approving their own attestations and the published social evidence being verified.

This reply has not been sent, and no social posts have been published from this session.
