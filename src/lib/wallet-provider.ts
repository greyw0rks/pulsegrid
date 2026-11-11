export type WalletProvider = {
  request(input: { method: string; params?: unknown[] }): Promise<unknown>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
};
export type DetectedWallet = { id: string; name: string; provider: WalletProvider };
type InjectedProvider = WalletProvider & { providers?: WalletProvider[]; isMetaMask?: boolean; isRabby?: boolean };
type WalletWindow = EventTarget & { ethereum?: InjectedProvider };

export function injectedWallets(target: WalletWindow): DetectedWallet[] {
  const ethereum = target.ethereum;
  const providers = ethereum?.providers?.length ? ethereum.providers : ethereum ? [ethereum] : [];
  return [...new Set(providers)].filter(provider => typeof provider?.request === "function").map((provider, index) => {
    const flags = provider as InjectedProvider;
    return { id: `injected-${index}`, name: flags.isRabby ? "Rabby" : flags.isMetaMask ? "MetaMask" : "Browser wallet", provider };
  });
}

// EIP-6963 gives each extension its own provider even when both claim window.ethereum.
export function watchWallets(target: WalletWindow, onChange: (wallets: DetectedWallet[]) => void) {
  const announced = new Map<string, DetectedWallet>();
  const current = () => announced.size ? [...announced.values()] : injectedWallets(target);
  const announce = (event: Event) => {
    const detail = (event as CustomEvent<{ info?: { uuid?: string; name?: string }; provider?: WalletProvider }>).detail;
    if (typeof detail?.info?.uuid !== "string" || !detail.info.uuid || typeof detail.info.name !== "string" || !detail.info.name || typeof detail.provider?.request !== "function") return;
    announced.set(detail.info.uuid, { id: detail.info.uuid, name: detail.info.name, provider: detail.provider });
    onChange(current());
  };
  const refresh = () => {
    target.dispatchEvent(new Event("eip6963:requestProvider"));
    const wallets = current();
    onChange(wallets);
    return wallets;
  };
  target.addEventListener("eip6963:announceProvider", announce);
  target.addEventListener("ethereum#initialized", refresh);
  return {
    refresh,
    stop: () => {
      target.removeEventListener("eip6963:announceProvider", announce);
      target.removeEventListener("ethereum#initialized", refresh);
    },
  };
}

export function walletErrorCode(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return;
  const value = error as { code?: number; data?: { originalError?: unknown }; cause?: unknown };
  return value.code === 4902 ? 4902 : walletErrorCode(value.data?.originalError) ?? walletErrorCode(value.cause) ?? value.code;
}
export function walletConnectionError(error: unknown) {
  const code = walletErrorCode(error);
  if (code === -32002) return "A wallet request is already waiting. Open your wallet extension, unlock it, and approve or dismiss the existing request before connecting again.";
  if (code === 4001) return "The wallet request was declined. Connect again when you are ready to approve access and BOT Chain.";
  if (code === 4100) return "Your wallet has not granted this site access. Open the extension, unlock it, and approve this site's connection.";
  const message = error instanceof Error ? error.message : typeof error === "object" && error !== null && "message" in error ? String(error.message) : "The wallet did not complete the request.";
  return `Wallet connection failed: ${message.slice(0, 300)}`;
}
export async function connectBotWallet(wallet: WalletProvider) {
  const accounts = await wallet.request({ method: "eth_requestAccounts" }) as string[];
  if (!Array.isArray(accounts) || !accounts[0]) throw new Error("No wallet account was selected. Unlock the extension and approve account access.");
  if (BigInt(await wallet.request({ method: "eth_chainId" }) as string) !== 677n) {
    try { await wallet.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x2a5" }] }); }
    catch (error) {
      if (walletErrorCode(error) !== 4902) throw error;
      await wallet.request({ method: "wallet_addEthereumChain", params: [{ chainId: "0x2a5", chainName: "BOT Chain mainnet", nativeCurrency: { name: "BOT", symbol: "BOT", decimals: 18 }, rpcUrls: ["https://rpc.botchain.ai"], blockExplorerUrls: ["https://scan.botchain.ai"] }] });
      if (BigInt(await wallet.request({ method: "eth_chainId" }) as string) !== 677n) await wallet.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x2a5" }] });
    }
  }
  const current = await wallet.request({ method: "eth_accounts" }) as string[];
  if (!Array.isArray(current) || !/^0x[0-9a-fA-F]{40}$/.test(current[0] ?? "") || BigInt(await wallet.request({ method: "eth_chainId" }) as string) !== 677n) throw new Error("Select the intended account on BOT Chain in your wallet, then connect again.");
  return current[0];
}
