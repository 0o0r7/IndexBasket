"use client";

import { useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  Loader2,
  LogOut,
  Wallet,
} from "lucide-react";
import { CHAIN_ID, explorerAddressUrl } from "@/lib/chain";
import { useWallet } from "@/lib/use-wallet";

/**
 * Header wallet control.
 *  - disconnected: real "Connect Wallet" button (the action-panel CTA links here)
 *  - connected: address pill + chain dot; click opens a menu with copy /
 *    explorer / disconnect.
 */
export function WalletButton() {
  const { address, chain, connectorName, isConnected, connecting, connect, disconnect } =
    useWallet();
  const [menuOpen, setMenuOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [mounted, setMounted] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Wallet state is client-only (localStorage + provider). Render a stable
  // placeholder on the server and first client paint so hydration always
  // matches (avoids React #418 for previously-authorized sessions).
  useEffect(() => setMounted(true), []);

  // close the dropdown on outside click / Escape
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  async function handleConnect() {
    setError(null);
    const res = await connect();
    if (!res.ok) {
      const failed = res.steps[res.steps.length - 1];
      setError(friendlyConnect(failed?.detail ?? "Unknown error"));
    }
  }

  if (!mounted) {
    return (
      <span
        className="inline-block w-[118px] h-[34px] rounded-xl bg-white/5 border border-white/10"
        aria-hidden="true"
      />
    );
  }

  if (!isConnected || !address) {
    return (
      <div className="relative">
        <button
          onClick={handleConnect}
          disabled={connecting}
          className="flex items-center gap-2 text-xs font-semibold px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-400 to-lime-300 text-black shadow-[0_4px_24px_-8px_rgba(52,211,153,0.8)] transition-transform enabled:hover:scale-[1.03] enabled:active:scale-[0.98] disabled:opacity-70"
          aria-label="Connect wallet"
        >
          {connecting ? (
            <Loader2 size={13} className="animate-spin" aria-hidden="true" />
          ) : (
            <Wallet size={13} aria-hidden="true" />
          )}
          {connecting ? "Connecting…" : "Connect Wallet"}
        </button>
        {error && (
          <p
            role="alert"
            className="absolute right-0 top-full mt-2 w-64 z-50 text-[11px] leading-snug text-rose-200 bg-rose-500/15 border border-rose-400/30 rounded-xl px-3 py-2 backdrop-blur-md"
          >
            {error}
          </p>
        )}
      </div>
    );
  }

  const wrongChain = chain?.id !== CHAIN_ID;

  return (
    <div className="relative" ref={wrapRef}>
      <button
        onClick={() => setMenuOpen((v) => !v)}
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        className="flex items-center gap-2 text-xs px-3.5 py-2 rounded-xl bg-emerald-400/10 border border-emerald-400/30 text-emerald-200 tnum transition-colors hover:border-emerald-400/60"
      >
        <span
          className={`w-1.5 h-1.5 rounded-full ${wrongChain ? "bg-amber-400" : "bg-emerald-400"}`}
          aria-hidden="true"
        />
        <Wallet size={13} aria-hidden="true" />
        {address.slice(0, 6)}…{address.slice(-4)}
        <ChevronDown size={12} className="opacity-60" aria-hidden="true" />
      </button>

      {menuOpen && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-2 w-64 z-50 glass rounded-2xl p-3 space-y-2"
        >
          <div className="text-[10px] uppercase tracking-widest text-white/40">
            {connectorName ?? "Injected wallet"} ·{" "}
            {wrongChain ? (
              <span className="text-amber-300">wrong chain</span>
            ) : (
              <span className="text-emerald-300">RH Testnet</span>
            )}
          </div>
          <button
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(address);
                setCopied(true);
                setTimeout(() => setCopied(false), 1200);
              } catch {
                /* clipboard unavailable — non-fatal */
              }
            }}
            className="w-full flex items-center justify-between text-xs text-white/70 hover:text-white bg-black/25 border border-white/8 rounded-xl px-3 py-2 transition-colors"
          >
            <span className="tnum">
              {address.slice(0, 10)}…{address.slice(-8)}
            </span>
            {copied ? (
              <Check size={12} className="text-emerald-300" aria-hidden="true" />
            ) : (
              <Copy size={12} aria-hidden="true" />
            )}
          </button>
          <a
            href={explorerAddressUrl(address)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between text-xs text-white/70 hover:text-emerald-300 bg-black/25 border border-white/8 rounded-xl px-3 py-2 transition-colors"
          >
            View on explorer <ExternalLink size={12} aria-hidden="true" />
          </a>
          <button
            onClick={() => {
              setMenuOpen(false);
              disconnect();
            }}
            className="w-full flex items-center justify-between text-xs text-rose-300/90 hover:text-rose-200 bg-rose-500/10 border border-rose-400/20 rounded-xl px-3 py-2 transition-colors"
          >
            Disconnect <LogOut size={12} aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}

function friendlyConnect(raw: string): string {
  if (/UserRejected|4001|rejected/i.test(raw)) return "Connection request rejected in wallet.";
  if (/no-provider/i.test(raw)) return raw;
  if (/Unsupported|unrecognized chain|46630/i.test(raw))
    return "Wallet does not recognize Robinhood Testnet (46630) yet — use the switch button after connect.";
  return raw.length > 180 ? raw.slice(0, 180) + "…" : raw;
}
