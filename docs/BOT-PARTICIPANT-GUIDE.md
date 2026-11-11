# File a Pulsegrid report with your wallet

Reporting page: https://pulsegrid-psi.vercel.app/bot/reports

The page is deployed. If a previously opened tab says **Record unavailable**, reload it. Wait for **Contract verified**, then connect your wallet. The verified wallet-reporting registry is [0xa906ff64af8bfbcd0408d793bfd13bfc2288cd4f](https://scan.botchain.ai/address/0xa906ff64af8bfbcd0408d793bfd13bfc2288cd4f?tab=contract).

Approved participant wallets:

- `0xBA46d08B9E298E8E70096Fc238Da207139BCCAB7`
- `0xB9e3A2D811729C11F64313F59922Ab37Afa52010`
- `0x0A4Da2520B480A6422aF61c889f16233DFB256B2`
- `0xc61Bbc0CF5694EF410A578A9833f77C173790450`

1. Open the reporting page in a browser with your EVM wallet extension. Keep your private key and recovery phrase in your wallet.
2. Click **Connect reporter wallet**. If both MetaMask and Rabby are installed, choose the extension that holds your approved address. Open and unlock that extension, approve account access, then approve switching to **BOT Chain mainnet**. If your wallet asks to add the network, its details are: chain ID **677**, currency **BOT**, RPC **https://rpc.botchain.ai**, explorer **https://scan.botchain.ai**.
3. Check that the page shows your address as **Approved reporter**. You need BOT for gas. The requested gas grants target **0.025 BOT per participant**; their successful transfers are recorded separately from report transactions.
4. Choose an incident. Open **Review the original incident**, **Inspect opening evidence**, and **Inspect recovery evidence**. The current completed incident is a historical **controlled drill**: the failure was simulated, and its original monitor identity and observation times remain in the evidence. Proceed only if you have reviewed the record and intend to attest it.
5. Click **Attest incident**. In your wallet, check BOT Chain, the verified wallet-reporting registry shown on the page, and a transaction sending **0 BOT** plus gas. Approve the transaction. The application limits its prepared maximum fee to **0.05 BOT**; the usual fee is much smaller.
6. Wait until the page says **Confirmed on BOT Chain**. Save the **BOTScan** transaction link. A submitted hash alone is not a successful receipt.
7. Click **Attest recovery** from the same wallet. Review and approve the second transaction, wait for confirmation, and save its BOTScan link too.
8. Give the project owner your wallet address and both transaction URLs. Your actual wallet appears in the contract events. Funding receipts and wallet approval do not count as reports.

If you refresh while a transaction is pending, the page resumes checking the saved hash without resending it. If browser storage is unavailable, keep the transaction link before leaving. If your wallet changes accounts or networks, reconnect before reporting. If a receipt reverts, inspect its BOTScan record before retrying. Never create a new report simply because receipt verification is delayed.

If connecting produces no popup, open the chosen extension directly and check for a pending request. Approve or dismiss it, unlock the wallet, and connect again. If the page says no extension was detected, allow the extension access to `pulsegrid-psi.vercel.app` and reload. A declined request or incomplete BOT network switch appears in the connection status below the button.

Each wallet can attest a given source incident once and can resolve only its own report. The same retained source may be reviewed by multiple participants; this does not turn one monitor's observations into multiple independent outage observations. The owner has confirmed that these four addresses belong to independent participants; on-chain records alone do not verify their independence.
