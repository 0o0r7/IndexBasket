"use client";

import { useMemo, useState } from "react";
import { useAccount, usePublicClient, useSwitchChain, useWriteContract } from "wagmi";
import { ArrowDownUp, Fuel, Loader2, ShieldCheck, Wallet } from "lucide-react";
import {
  BASKET_ADDRESS,
  basketAbi,
  erc20Abi,
  quoteMintIn,
  quoteRedeemOut,
  fmtToken,
  WAD,
} from "@/lib/contract";
import { CHAIN_ID } from "@/lib/chain";
import type { Row } from "@/lib/use-basket";

export type ActivityEntry = {
  id: string;
  kind: "approve" | "mint" | "redeem";
  label: string;
  hash: string;
  status: "pending" | "confirmed" | "failed";
  at: number;
};

type Tab = "mint" | "redeem";
type Phase = "idle" | "working";

function parseAmount(input: string): bigint | null {
  const t = input.trim();
  if (!/^\d*(\.\d*)?$/.test(t) || t === "" || t === ".") return null;
  const [whole, frac = ""] = t.split(".");
  const frac18 = (frac + "0".repeat(18)).slice(0, 18);
  try {
    return BigInt(whole || "0") * WAD + BigInt(frac18 || "0");
  } catch {
    return null;
  }
}

export function ActionPanel({
  rows,
  basketSymbol,
  yourShares,
  connected,
  wrongChain,
  onActivity,
  onMutated,
}: {
  rows: Row[];
  basketSymbol: string;
  yourShares: bigint | null;
  connected: boolean;
  wrongChain: boolean;
  onActivity: (e: ActivityEntry) => void;
  onMutated: (hash: string, ok: boolean) => void;
}) {
  const [tab, setTab] = useState<Tab>("mint");
  const [amount, setAmount] = useState("1");
  const [phase, setPhase] = useState<Phase>("idle");
  const [stepMsg, setStepMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { switchChain } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();

  const shares = useMemo(() => parseAmount(amount), [amount]);

  const quote = useMemo(() => {
    if (shares === null || shares === 0n) return null;
    if (tab === "mint") {
      return rows.map((r) => ({ row: r, amount: quoteMintIn(r.unitsPerShare, shares) }));
    }
    return rows.map((r) => ({ row: r, amount: quoteRedeemOut(r.unitsPerShare, shares) }));
  }, [rows, shares, tab]);

  async function wait(hash: `0x${string}`): Promise<boolean> {
    try {
      const rcpt = await publicClient!.waitForTransactionReceipt({ hash });
      return rcpt.status === "success";
    } catch {
      return false;
    }
  }

  function friendly(e: unknown): string {
    const msg = e instanceof Error ? e.message : String(e);
    if (/UserRejected|4001|rejected/i.test(msg)) return "Transaction rejected in wallet.";
    if (/insufficient allowance/i.test(msg)) return "Approval missing — approve first.";
    if (/ERC20InsufficientBalance/i.test(msg)) return "Insufficient token balance.";
    if (/AlreadyInitialized|NotInitialized|ZeroShares|LengthMismatch/i.test(msg)) {
      return "Contract rejected the call (state guard).";
    }
    return msg.length > 160 ? msg.slice(0, 160) + "…" : msg;
  }

  async function execute() {
    if (!BASKET_ADDRESS || !address || !publicClient || shares === null || shares === 0n) return;
    setError(null);
    setPhase("working");

    try {
      if (tab === "mint") {
        // 1) approvals — re-read each allowance FRESH at execution time so the
        // decision never relies on possibly-stale hook data
        const need = quote ?? [];
        for (let i = 0; i < need.length; i++) {
          const { row, amount: needed } = need[i];
          const freshAllowance = await publicClient.readContract({
            abi: erc20Abi,
            address: row.token,
            functionName: "allowance",
            args: [address, BASKET_ADDRESS],
          });
          if (freshAllowance >= needed) continue;
          setStepMsg(`Approving ${row.symbol}…`);
          const hash = await writeContractAsync({
            abi: erc20Abi,
            address: row.token,
            functionName: "approve",
            args: [BASKET_ADDRESS, 2n ** 256n - 1n],
          });
          onActivity({
            id: `${hash}-approve-${row.symbol}`,
            kind: "approve",
            label: `Approve ${row.symbol}`,
            hash,
            status: "pending",
            at: Date.now(),
          });
          const ok = await wait(hash);
          onMutated(hash, ok);
          if (!ok) throw new Error(`Approval for ${row.symbol} failed on-chain.`);
        }

        // 2) mint
        setStepMsg(`Minting ${fmtToken(shares, 18, 6)} ${basketSymbol}…`);
        const hash = await writeContractAsync({
          abi: basketAbi,
          address: BASKET_ADDRESS,
          functionName: "mint",
          args: [shares],
        });
        onActivity({
          id: hash,
          kind: "mint",
          label: `Mint ${fmtToken(shares, 18, 6)} ${basketSymbol}`,
          hash,
          status: "pending",
          at: Date.now(),
        });
        const ok = await wait(hash);
        onMutated(hash, ok);
        if (!ok) throw new Error("Mint transaction reverted on-chain.");
      } else {
        setStepMsg(`Redeeming ${fmtToken(shares, 18, 6)} ${basketSymbol}…`);
        const hash = await writeContractAsync({
          abi: basketAbi,
          address: BASKET_ADDRESS,
          functionName: "redeem",
          args: [shares],
        });
        onActivity({
          id: hash,
          kind: "redeem",
          label: `Redeem ${fmtToken(shares, 18, 6)} ${basketSymbol}`,
          hash,
          status: "pending",
          at: Date.now(),
        });
        const ok = await wait(hash);
        onMutated(hash, ok);
        if (!ok) throw new Error("Redeem transaction reverted on-chain.");
      }

      setStepMsg(null);
      setAmount("1");
    } catch (e) {
      setError(friendly(e));
    } finally {
      setPhase("idle");
      setStepMsg(null);
    }
  }

  const overBalance =
    tab === "redeem" && yourShares !== null && shares !== null && shares > yourShares;

  const canSubmit =
    connected &&
    !wrongChain &&
    BASKET_ADDRESS !== null &&
    shares !== null &&
    shares > 0n &&
    !overBalance &&
    phase === "idle";

  const ctaLabel = (() => {
    if (!connected) return "Connect wallet to continue";
    if (wrongChain) return "Switch to Robinhood Testnet";
    if (BASKET_ADDRESS === null) return "Contract not deployed";
    if (shares === null || shares === 0n) return "Enter an amount";
    if (overBalance) return `Only ${fmtToken(yourShares ?? 0n, 18, 4)} ${basketSymbol} available`;
    if (phase === "working") return stepMsg ?? "Working…";
    return tab === "mint" ? `Mint ${amount || "0"} ${basketSymbol}` : `Redeem ${amount || "0"} ${basketSymbol}`;
  })();

  return (
    <section className="glass p-5 sm:p-6" aria-label="Mint or redeem basket shares">
      {/* tabs */}
      <div className="flex w-fit rounded-2xl bg-black/40 border border-white/8 p-1 mb-6" role="tablist" aria-label="Mint or redeem">
        {(["mint", "redeem"] as Tab[]).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`px-5 py-2 rounded-xl text-sm font-medium transition-all duration-300 ${
              tab === t
                ? "bg-gradient-to-r from-emerald-400 to-lime-300 text-black shadow-[0_4px_24px_-6px_rgba(52,211,153,0.7)]"
                : "text-white/50 hover:text-white/85"
            }`}
          >
            {t === "mint" ? "Mint" : "Redeem"}
          </button>
        ))}
      </div>

      {/* amount input */}
      <label className="text-[11px] uppercase tracking-widest text-white/40" htmlFor="share-amount">
        {tab === "mint" ? "Basket shares to mint" : "Basket shares to redeem"}
      </label>
      <div className="relative mt-2">
        <input
          id="share-amount"
          inputMode="decimal"
          autoComplete="off"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-full bg-black/40 border border-white/10 focus:border-emerald-400/60 rounded-2xl px-4 py-4 pr-16 text-xl font-display font-semibold tnum outline-none transition-colors"
          placeholder="0.0"
        />
        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-semibold text-emerald-300/90">
          {basketSymbol || "BTRIO"}
        </span>
      </div>
      <div className="flex gap-2 mt-2">
        {["0.5", "1", "5"].map((q) => (
          <button
            key={q}
            onClick={() => setAmount(q)}
            className="px-3 py-1 rounded-lg bg-white/5 border border-white/10 text-[11px] text-white/60 hover:text-white hover:border-emerald-400/40 transition-colors"
          >
            {q}
          </button>
        ))}
      </div>

      <div className="flex justify-center my-4 text-white/20">
        <ArrowDownUp size={18} aria-hidden="true" />
      </div>

      {/* quote */}
      <div className="rounded-2xl bg-black/30 border border-white/8 p-4" aria-live="polite">
        <div className="text-[11px] uppercase tracking-widest text-white/40 mb-3">
          {tab === "mint" ? "You provide (exact, rounded up)" : "You receive (rounded down)"}
        </div>
        {quote === null ? (
          <p className="text-sm text-white/30">Enter an amount to see the composition quote.</p>
        ) : (
          <div className="space-y-2.5">
            {quote.map(({ row, amount: amt }) => (
              <div key={`${row.index}`} className="flex items-baseline text-sm">
                <span className="text-white/60">{row.symbol}</span>
                <span className="dotted-leader" aria-hidden="true" />
                <span className="tnum text-white/90">{fmtToken(amt, row.decimals)}</span>
              </div>
            ))}
            {tab === "mint" && (
              <p className="text-[11px] text-white/35 pt-1 flex items-center gap-1.5">
                <Fuel size={11} aria-hidden="true" />
                Mint pulls every component in one transaction — approvals are requested first if missing.
              </p>
            )}
          </div>
        )}
      </div>

      {error && (
        <p className="mt-3 text-xs text-rose-300 bg-rose-500/10 border border-rose-500/25 rounded-xl px-3 py-2" role="alert">
          {error}
        </p>
      )}

      {/* CTA */}
      {wrongChain && connected ? (
        <button
          onClick={() => switchChain({ chainId: CHAIN_ID })}
          className="w-full mt-4 py-3.5 rounded-2xl bg-gradient-to-r from-amber-300 to-amber-400 text-black font-semibold transition-transform hover:scale-[1.01] active:scale-[0.99]"
        >
          Switch to Robinhood Testnet (46630)
        </button>
      ) : (
        <button
          onClick={execute}
          disabled={!canSubmit}
          className="w-full mt-4 py-3.5 rounded-2xl font-semibold transition-all duration-300 disabled:cursor-not-allowed bg-gradient-to-r from-emerald-400 to-lime-300 text-black enabled:hover:scale-[1.01] enabled:active:scale-[0.99] enabled:glass-cta disabled:bg-white/5 disabled:text-white/30 disabled:bg-none flex items-center justify-center gap-2"
        >
          {phase === "working" && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
          {phase === "idle" && !connected && <Wallet size={15} aria-hidden="true" />}
          {phase === "idle" && connected && tab === "mint" && <ShieldCheck size={15} aria-hidden="true" />}
          <span>{ctaLabel}</span>
        </button>
      )}

      <p className="mt-3 text-[11px] leading-relaxed text-white/35">
        Mint deposits the exact weighted components and mints 1:1 shares. Redeem burns shares and
        returns components 1:1 with recorded weights. No price feed is read anywhere — composition
        only, verifiable on-chain.
      </p>
    </section>
  );
}
