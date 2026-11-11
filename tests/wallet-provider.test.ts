import { describe, expect, it, vi } from "vitest";
import { connectBotWallet, injectedWallets, watchWallets, walletConnectionError, walletErrorCode, type DetectedWallet, type WalletProvider } from "../src/lib/wallet-provider";
const account = "0xBA46d08B9E298E8E70096Fc238Da207139BCCAB7";
describe("extension discovery", () => {
  it("discovers MetaMask and Rabby separately without using their shared global provider", () => {
    const target = Object.assign(new EventTarget(), { ethereum: { request: vi.fn() } });
    const metamask = { request: vi.fn() }, rabby = { request: vi.fn() };
    const announce = () => {
      for (const [uuid, name, provider] of [["metamask", "MetaMask", metamask], ["rabby", "Rabby", rabby]] as const) {
        target.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail: { info: { uuid, name }, provider } }));
      }
    };
    target.addEventListener("eip6963:requestProvider", announce);
    const changed = vi.fn();
    const watcher = watchWallets(target, changed);
    expect(watcher.refresh()).toEqual([{ id: "metamask", name: "MetaMask", provider: metamask }, { id: "rabby", name: "Rabby", provider: rabby }]);
    expect(watcher.refresh()).toHaveLength(2);
    expect(target.ethereum.request).not.toHaveBeenCalled();
    watcher.stop(); changed.mockClear();
    announce();
    expect(changed).not.toHaveBeenCalled();
  });
  it("supports legacy provider arrays, deduplicates references, and labels Rabby even when it claims MetaMask", () => {
    const metamask = { request: vi.fn(), isMetaMask: true };
    const rabby = { request: vi.fn(), isMetaMask: true, isRabby: true };
    const target = Object.assign(new EventTarget(), { ethereum: { request: vi.fn(), providers: [metamask, rabby, rabby] } });
    expect(injectedWallets(target).map(wallet => wallet.name)).toEqual(["MetaMask", "Rabby"]);
  });
  it("finds extensions injected after hydration and again when the user connects", () => {
    const target: EventTarget & { ethereum?: WalletProvider } = new EventTarget();
    const changed = vi.fn();
    const watcher = watchWallets(target, changed);
    expect(watcher.refresh()).toEqual([]);
    target.ethereum = { request: vi.fn() };
    target.dispatchEvent(new Event("ethereum#initialized"));
    expect(changed).toHaveBeenLastCalledWith([expect.objectContaining({ provider: target.ethereum })]);
    expect(watcher.refresh()).toHaveLength(1);
    watcher.stop();
  });
  it("accepts late EIP-6963 announcements and ignores malformed announcements", () => {
    const target = new EventTarget();
    let found: DetectedWallet[] = [];
    const watcher = watchWallets(target, wallets => { found = wallets; });
    watcher.refresh();
    target.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail: { info: { uuid: "broken", name: "Broken" }, provider: {} } }));
    expect(found).toEqual([]);
    const provider = { request: vi.fn() };
    target.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail: { info: { uuid: "late", name: "Rabby" }, provider } }));
    expect(found).toEqual([{ id: "late", name: "Rabby", provider }]);
    watcher.stop();
  });
});
describe("extension connection", () => {
  it("uses the chosen extension and verifies its final account on BOT", async () => {
    const request = vi.fn(async ({ method }: { method: string }) => method === "eth_chainId" ? "0x2a5" : [account]);
    expect(await connectBotWallet({ request })).toBe(account);
    expect(request.mock.calls.map(([input]) => input.method)).toEqual(["eth_requestAccounts", "eth_chainId", "eth_accounts", "eth_chainId"]);
  });
  it("switches an existing BOT network before returning an account", async () => {
    let chain = "0x1";
    const wallet: WalletProvider = { request: vi.fn(async ({ method }) => {
      if (method === "eth_chainId") return chain;
      if (method === "wallet_switchEthereumChain") { chain = "0x2a5"; return null; }
      return [account];
    }) };
    expect(await connectBotWallet(wallet)).toBe(account);
    expect(wallet.request).toHaveBeenCalledWith({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x2a5" }] });
  });
  it("handles nested unknown-chain errors and wallets that add without switching", async () => {
    let chain = "0x1", added = false;
    const wallet: WalletProvider = { request: vi.fn(async ({ method }) => {
      if (method === "eth_chainId") return chain;
      if (method === "wallet_switchEthereumChain") {
        if (!added) throw { code: -32603, data: { originalError: { code: 4902 } } };
        chain = "0x2a5"; return null;
      }
      if (method === "wallet_addEthereumChain") { added = true; return null; }
      return [account];
    }) };
    expect(await connectBotWallet(wallet)).toBe(account);
    expect(wallet.request).toHaveBeenCalledWith(expect.objectContaining({ method: "wallet_addEthereumChain" }));
  });
  it("keeps a pending extension request actionable instead of retrying access", async () => {
    const request = vi.fn().mockRejectedValue({ code: -32002 });
    await expect(connectBotWallet({ request })).rejects.toMatchObject({ code: -32002 });
    expect(request).toHaveBeenCalledTimes(1);
    expect(walletConnectionError({ code: -32002 })).toContain("already waiting");
  });
  it("does not swallow a declined switch or grant chain access automatically", async () => {
    const request = vi.fn(async ({ method }: { method: string }) => {
      if (method === "eth_chainId") return "0x1";
      if (method === "wallet_switchEthereumChain") throw { code: 4001 };
      return [account];
    });
    await expect(connectBotWallet({ request })).rejects.toMatchObject({ code: 4001 });
    expect(request.mock.calls.some(([input]) => input.method === "wallet_addEthereumChain")).toBe(false);
    expect(walletConnectionError({ code: 4001 })).toContain("declined");
  });
  it("rejects disconnected accounts or a wallet remaining on another chain", async () => {
    const disconnected: WalletProvider = { request: async ({ method }) => method === "eth_chainId" ? "0x2a5" : method === "eth_accounts" ? [] : [account] };
    await expect(connectBotWallet(disconnected)).rejects.toThrow("intended account");
    const wrongChain: WalletProvider = { request: async ({ method }) => method === "eth_chainId" ? "0x1" : [account] };
    await expect(connectBotWallet(wrongChain)).rejects.toThrow("BOT Chain");
  });
  it("retains actual wallet failure messages and nested chain codes", () => {
    expect(walletErrorCode({ code: -32603, data: { originalError: { code: 4902 } } })).toBe(4902);
    expect(walletConnectionError(new Error("Extension is locked"))).toContain("Extension is locked");
    expect(walletConnectionError({ code: 4100 })).toContain("site access");
  });
});
