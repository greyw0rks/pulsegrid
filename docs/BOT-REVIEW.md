# BOT Chain review delivery

Updated November 11, 2026. The wallet connection fix is live for MetaMask and Rabby. Three approved participant wallets have completed incident and recovery attestations: together with the original drill, eight successful core transactions across four wallets have been verified. The launch announcement is published, and the five supplied original profile posts all fall within the last 30 days. The review evidence package is complete and the reply below is ready to send; reviewer delivery and acceptance have not been confirmed.

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
| Personal X profile | https://x.com/Greyw0rks — confirmed by the supplied published posts and public author metadata |
| Mainnet launch announcement | [Published November 11](https://x.com/Greyw0rks/status/2120488726468190656); links the verified BOT mainnet app |
| Five original X posts within 30 days | **Met:** five supplied original profile posts, dated October 29–November 11; verified November 11 |
| Participant reporting | https://pulsegrid-psi.vercel.app/bot/reports; [participant guide](BOT-PARTICIPANT-GUIDE.md) |
| Verified wallet-reporting registry | https://scan.botchain.ai/address/0xa906ff64af8bfbcd0408d793bfd13bfc2288cd4f?tab=contract |
| Four participant gas grants | 0.025 BOT each; [successful transfer receipts](evidence/participant-gas-grants-677.json); excluded from core-action counts |
| Five successful core transactions across three wallets | **Met:** eight successful core transactions across four wallets, comprising the original two plus six participant attestations |

Both product receipts succeeded. The transaction inputs, events, contract state, BOTScan records, and canonical evidence hashes match. These are controlled execution evidence. The simulated failure does not establish an actual BOT RPC outage or independent adoption. Deployment transactions are excluded from the core-product count.

Fresh read-only proof: [bot-review-2026-11-11.json](evidence/bot-review-2026-11-11.json). Reproduce with `node --import tsx scripts/verify-bot-review.ts`; each run writes a dated snapshot. The [November 9 proof](evidence/bot-review-2026-11-09.json) remains as a historical record.

## Verified participant receipts

| Participant wallet | Incident | Recovery |
| --- | --- | --- |
| `0xBA46d08B9E298E8E70096Fc238Da207139BCCAB7` | [Successful receipt](https://scan.botchain.ai/tx/0x1e0ad5adf8beb8e114e239854d14cfb284c2a84b228d2386ec994ab8bdefaa2a) | [Successful receipt](https://scan.botchain.ai/tx/0x90805c57e4461b2f3cb97beff57307a525b79141a6ff1e81677000750e7fabf3) |
| `0xB9e3A2D811729C11F64313F59922Ab37Afa52010` | [Successful receipt](https://scan.botchain.ai/tx/0x9a165f5774d771dba715c14b60cf7cddae57e417880bc204aa3012a2df6109d2) | [Successful receipt](https://scan.botchain.ai/tx/0x4b8af3f950dc6c1bf339548e86919f1efbf65466f1de6971d9cad7664ac554ea) |
| `0xc61Bbc0CF5694EF410A578A9833f77C173790450` | [Successful receipt](https://scan.botchain.ai/tx/0xba8f7f917e0e132887b4aae8fef268951620f7f0279e0b4dd06ff637970fa43a) | [Successful receipt](https://scan.botchain.ai/tx/0x25327934b7a7142c933db5c9efc6d6b0bc6363b221bf20a0b2161c81a98f7b10) |

The six participant receipts match the exact registry, signer, calldata, emitted events, contract state, canonical source evidence, and BOTScan records. They attest the retained controlled drill; they do not establish fresh outages or independent monitors. Participant independence is confirmed by the owner and cannot be established from transaction counts alone. The remaining approved participant wallet does not need to transact to meet this numerical threshold.

## Published social evidence

| Original post | Publication date (UTC) | Topic |
| --- | --- | --- |
| https://x.com/Greyw0rks/status/2120488726468190656 | 2026-11-11 | Pulsegrid live on `@BOTChain_ai`, with BOT application link |
| https://x.com/Greyw0rks/status/2119320148867710984 | 2026-11-08 | Hackathon builder/audio tooling tip |
| https://x.com/Greyw0rks/status/2117555947757535458 | 2026-11-03 | Greed Machine project |
| https://x.com/Greyw0rks/status/2117323746600161676 | 2026-11-02 | Greed Machine announcement |
| https://x.com/Greyw0rks/status/2115714709961822572 | 2026-10-29 | Atlas builder workflow |

All five public X records identify Greyw0rks as author, contain original text, and show no reply or repost metadata. Their publication dates match their X identifier timestamps and are within the preceding 30 days as of verification. The launch announces Pulsegrid live on BOT and links the independently verified mainnet app; it does not use the word "mainnet." The five-post condition is assessed for the personal profile, not as five separate Pulsegrid announcements. Public-source snapshots and normalized URLs are retained in [bot-social-2026-11-11.json](evidence/bot-social-2026-11-11.json); reproduce with `node --import tsx scripts/verify-bot-social.ts`.

## Independent project description

Pulsegrid is an independent RPC monitoring and recovery attestation project. It retains endpoint health checks, incident evidence, and separate recovery evidence, then links authorized reports to verifiable on-chain receipts. Its BOT Chain mainnet integration extends the existing Portaldot project and preserves its original deployment.

## Exact reporter limitation

The deployed registry's `authorizedReporter` is the immutable address `0xE79bB36b53835f0740BD4a9684F5C84d8fB9b52C`. Both `openIncident` and `resolveIncident` use `onlyReporter`. Other callers revert with `UnauthorizedReporter()`. The verified source has no function to add or rotate reporters. Fresh read-only `eth_call` simulations confirmed this rejection for both methods; simulations are not transactions and do not count toward the review requirement.

Automatic on-chain reporting remains disabled at the owner's request. Five-minute RPC observations and receipt indexing continue. The additional reports above were approved through participant wallets.

On November 10, the owner confirmed participant wallets and requested a total of four participant addresses. A separately deployed registry allows those approved wallets to attest the retained source evidence and resolve only their own reports. Exact Solidity source, deployment, owner, runtime code hash, and reporter permissions were verified. User-authorized gas grants succeeded for all four wallets. On November 11, the three participants above completed their own reports; funding transactions are excluded from the core-action counts.

## Reviewer reply ready to send

Thanks for the checklist. Pulsegrid's BOT Chain app and complete incident/recovery proof are ready now:

App and review evidence: https://pulsegrid-psi.vercel.app/bot/review

Incident: https://scan.botchain.ai/tx/0xee33697d340e3b5b431effde5f3e714785f829c18016106e461d8b8eff44c482

Recovery: https://scan.botchain.ai/tx/0xc45051c97ba890a9215639c2df7c5cd767908dc3e67c95ddb60270b7f0b0b9fc

Both receipts succeeded and match the retained evidence. These are labelled controlled mainnet drill transactions. The website links to BOT Chain and BOTScan and includes Pulsegrid's independent project description.

The original registry has one immutable reporter. We added a verified wallet-reporting registry so approved participants can review the retained evidence and submit their own incident and recovery attestations. Three participants have completed both actions. All eight successful core transactions across four wallets are now verified, meeting the numerical requirement; deployment, permission, and gas-grant transactions are excluded. The public review page shows the combined count, and the reporting page links each participant receipt.

Personal profile: https://x.com/Greyw0rks

Published launch announcement: https://x.com/Greyw0rks/status/2120488726468190656

Five original profile posts within the last 30 days, including the launch:

- https://x.com/Greyw0rks/status/2120488726468190656
- https://x.com/Greyw0rks/status/2119320148867710984
- https://x.com/Greyw0rks/status/2117555947757535458
- https://x.com/Greyw0rks/status/2117323746600161676
- https://x.com/Greyw0rks/status/2115714709961822572

Technical delivery, transaction-count evidence, and published social evidence are ready for review.

This reply has not been sent by the agent. The owner published the launch; the agent only verified the supplied links.
