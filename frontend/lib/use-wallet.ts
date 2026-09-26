"use client";

import { useCallback, useMemo } from "react";
import { useAccount, useConnect, useDisconnect } from "wagmi";

export type WalletDiagnostics =
  | { step: "no-provider"; detail: string }
  | { step: "provider-found"; detail: string }
  | { step: "accounts"; detail: string }
  | { step: "chain"; detail: string }
  | { step: "done"; detail: string };

function anyInjectedProvider(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as unknown as Record<string, unknown>;
  return typeof w.ethereum !== "undefined" || typeof w.ethereums !== "undefined";
}

/**
 * Shared wallet connect/disconnect wiring. Used by the header WalletButton
 * and by the action-panel's connect CTA so both entry points behave the same.
 *
 * wagmi v2 injected(): EIP-6963-announced wallets get their own connector
 * (id = wallet rdns); a generic "Injected" fallback covers legacy
 * window.ethereum-only wallets. We prefer an EIP-6963 connector when one
 * exists, then any other ready injected connector.
 */
export function useWallet() {
  const { address, chain, connector, isConnected } = useAccount();
  const { connectAsync, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();

  const injectedConnectors = useMemo(
    () => connectors.filter((c) => c.type === "injected"),
    [connectors]
  );

  const pickConnector = useCallback(() => {
    // EIP-6963 announced wallets carry their rdns as id — prefer them over
    // the generic legacy shim so multi-wallet users get their chosen wallet.
    const eip6963 = injectedConnectors.filter((c) => c.id !== "injected");
    if (eip6963.length > 0) return eip6963[0];
    return injectedConnectors[0] ?? connectors[0] ?? null;
  }, [injectedConnectors, connectors]);

  const walletInstalled =
    injectedConnectors.some((c) => (c as unknown as { ready?: boolean }).ready !== false) ||
    anyInjectedProvider();

  /** E2E-friendly granular connect that also surfaces each intermediate step. */
  const connectWithSteps = useCallback(async (): Promise<
    { ok: true; steps: WalletDiagnostics[] } | { ok: false; steps: WalletDiagnostics[] }
  > => {
    const steps: WalletDiagnostics[] = [];
    if (!anyInjectedProvider()) {
      steps.push({
        step: "no-provider",
        detail:
          "No EIP-1193 provider found in this browser. Install MetaMask (or another injected wallet) and reload.",
      });
      return { ok: false, steps };
    }
    steps.push({ step: "provider-found", detail: "EIP-1193 provider detected (window.ethereum)." });

    const target = pickConnector();
    if (!target) {
      steps.push({ step: "no-provider", detail: "wagmi exposes no injected connector." });
      return { ok: false, steps };
    }
    try {
      const result = await connectAsync({ connector: target });
      const account = result?.accounts?.[0] ?? null;
      steps.push({
        step: "accounts",
        detail: account ? `Connected ${account.slice(0, 6)}…${account.slice(-4)}` : "Connected.",
      });
      steps.push({
        step: "chain",
        detail: result?.chainId
          ? `Wallet chainId ${result.chainId}${result.chainId !== 46630 ? " — switch to 46630 required" : ""}`
          : "ChainId unavailable from connector result.",
      });
      steps.push({ step: "done", detail: "Connect flow complete." });
      return { ok: true, steps };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      steps.push({ step: "accounts", detail: `Connect failed: ${msg.slice(0, 200)}` });
      return { ok: false, steps };
    }
  }, [connectAsync, pickConnector]);

  return {
    address,
    chain,
    connectorName: connector?.name ?? null,
    isConnected,
    connecting: isPending,
    walletInstalled,
    connect: connectWithSteps,
    disconnect,
  };
}
