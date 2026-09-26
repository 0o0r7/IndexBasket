"use client";

import { useCallback, useState } from "react";
import { useAccount, useBalance } from "wagmi";
import { AlertTriangle, ExternalLink, Info, TrendingUp, Wallet } from "lucide-react";
import { BASKET_ADDRESS, fmtToken, fmtUsd, referencePrice, WAD } from "@/lib/contract";
import { CHAIN_ID, EXPLORER_URL, FAUCET_URL, explorerAddressUrl } from "@/lib/chain";
import { useBasketData } from "@/lib/use-basket";
import { CompositionCard } from "./composition-card";
import { ActionPanel, type ActivityEntry } from "./action-panel";
import { ActivityLog } from "./activity-log";

export function BasketApp() {
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const { address, chain, isConnected } = useAccount();
  const wrongChain = isConnected && chain?.id !== CHAIN_ID;

  const { meta, rows, isLoading, refetchAll } = useBasketData();
  const symbol = meta.symbol || "BTRIO";

  const eth = useBalance({ address });

  const pushActivity = useCallback((e: ActivityEntry) => {
    setActivity((prev) => [e, ...prev]);
  }, []);

  const onMutated = useCallback(
    (hash: string, ok: boolean) => {
      setActivity((prev) =>
        prev.map((e) =>
          e.hash === hash ? { ...e, status: ok ? ("confirmed" as const) : ("failed" as const) } : e
        )
      );
      refetchAll();
    },
    [refetchAll]
  );

  // Reference valuation: on-chain weights × clearly-labeled illustrative prices
  const refSharePrice = rows.reduce(
    (sum, r) =>
      sum +
      (r.unitsPerShare > 0n
        ? (Number(r.unitsPerShare) / Number(WAD)) * (referencePrice(r.symbol) ?? 0)
        : 0),
    0
  );
  const refYourValue =
    meta.yourShares !== null ? (Number(meta.yourShares) / Number(WAD)) * refSharePrice : null;

  return (
    <div className="min-h-screen flex flex-col">
      {/* ------------------------------------------------ header */}
      <header className="sticky top-0 z-40 border-b border-white/8 bg-black/55 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-400 to-lime-300 grid place-items-center shadow-[0_0_24px_-4px_rgba(52,211,153,0.8)]">
              <TrendingUp size={18} className="text-black" strokeWidth={2.5} aria-hidden="true" />
            </div>
            <div>
              <div className="font-display text-sm font-bold leading-tight">
                {isLoading ? "…" : meta.name || "Builder Trio Index"}
              </div>
              <div className="text-[11px] text-white/40 leading-tight">
                Testnet index basket · no price feed
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <span className="hidden md:inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded-full bg-emerald-400/8 border border-emerald-400/25 text-emerald-300/90">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 pulse-dot" aria-hidden="true" />
              RH Testnet · {CHAIN_ID}
            </span>
            {isConnected && address ? (
              <span className="flex items-center gap-2 text-xs px-3.5 py-2 rounded-xl bg-emerald-400/10 border border-emerald-400/30 text-emerald-200 tnum">
                <Wallet size={13} aria-hidden="true" />
                {address.slice(0, 6)}…{address.slice(-4)}
              </span>
            ) : null}
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 py-7 space-y-6">
        {/* disclosure */}
        <div
          className="flex items-start gap-2.5 bg-amber-400/[0.06] border border-amber-400/20 rounded-2xl px-4 py-3"
          role="note"
        >
          <AlertTriangle size={15} className="text-amber-300 mt-0.5 shrink-0" aria-hidden="true" />
          <p className="text-[11px] leading-relaxed text-amber-200/75">
            <span className="font-semibold text-amber-200">Testnet only — no financial value.</span>{" "}
            Component reference prices are illustrative constants, not live feeds (Robinhood&apos;s live
            Stock Token price feeds are mainnet-only). All balances, weights and quotes come from
            on-chain reads. Shares and test ETH are not redeemable for anything of value.
          </p>
        </div>

        {/* not-deployed state */}
        {BASKET_ADDRESS === null ? (
          <section className="glass p-10 text-center" aria-label="Contract not deployed">
            <h1 className="font-display text-xl font-bold mb-2">No contract deployed yet</h1>
            <p className="text-sm text-white/50 max-w-md mx-auto leading-relaxed">
              This frontend has no basket address configured. Set{" "}
              <code className="text-emerald-300 tnum">NEXT_PUBLIC_BASKET_ADDRESS</code> or run the CI
              deployment so <code className="text-emerald-300 tnum">deployments/testnet.json</code> exists.
            </p>
          </section>
        ) : (
          <>
            {/* hero stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatTile
                label="Your shares"
                value={meta.yourShares !== null ? fmtToken(meta.yourShares, 18, 4) : "—"}
                accent
              />
              <StatTile
                label={`Total ${symbol} supply`}
                value={isLoading ? "…" : fmtToken(meta.totalSupply, 18, 4)}
              />
              <StatTile label="Reference / share" value={`≈ ${fmtUsd(refSharePrice)}`} sub="illustrative" />
              <StatTile label="Your ETH" value={eth.data ? Number(eth.data.formatted).toFixed(4) : "—"} />
            </div>

            <div className="grid lg:grid-cols-5 gap-6 items-start">
              <div className="lg:col-span-2 space-y-6">
                <CompositionCard rows={rows} basketSymbol={symbol} loading={isLoading} />

                <section className="glass p-5 sm:p-6" aria-label="Contract links">
                  <h2 className="font-display text-sm font-semibold tracking-wide text-white/85 mb-4">
                    Contract
                  </h2>
                  <div className="space-y-2.5 text-sm">
                    <LinkRow
                      label="IndexBasket (verified source)"
                      href={explorerAddressUrl(BASKET_ADDRESS)}
                      value={`${BASKET_ADDRESS.slice(0, 10)}…${BASKET_ADDRESS.slice(-6)}`}
                    />
                    <LinkRow
                      label="Testnet faucet (tokens + ETH)"
                      href={FAUCET_URL}
                      value="faucet.testnet.chain.robinhood.com"
                    />
                    <LinkRow
                      label="Block explorer"
                      href={EXPLORER_URL}
                      value="explorer.testnet.chain.robinhood.com"
                    />
                  </div>
                </section>
              </div>

              <div className="lg:col-span-3 space-y-6">
                <ActionPanel
                  rows={rows}
                  basketSymbol={symbol}
                  yourShares={meta.yourShares}
                  connected={isConnected}
                  wrongChain={wrongChain}
                  onActivity={pushActivity}
                  onMutated={onMutated}
                />
                <ActivityLog entries={activity} />
              </div>
            </div>
          </>
        )}

        <div className="flex items-start gap-2 text-[11px] text-white/30 px-1">
          <Info size={12} className="mt-0.5 shrink-0" aria-hidden="true" />
          <p>
            Independent testnet demo. Not affiliated with, endorsed by, or connected to Robinhood
            Markets. Every number this UI displays is either read from the chain or explicitly
            labeled as an illustrative reference constant.
          </p>
        </div>
      </main>

      {/* ------------------------------------------------ footer (sticky bottom) */}
      <footer className="mt-auto border-t border-white/8 bg-black/45 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-5 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-[11px] text-white/35">
            Robinhood Chain Testnet · Chain ID {CHAIN_ID} · Built with Next.js + wagmi + viem
          </p>
          <a
            href={BASKET_ADDRESS ? explorerAddressUrl(BASKET_ADDRESS) : EXPLORER_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-[11px] text-white/45 hover:text-emerald-300 transition-colors"
          >
            View contract on explorer <ExternalLink size={11} aria-hidden="true" />
          </a>
        </div>
      </footer>
    </div>
  );
}

function StatTile({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div className={`glass p-4 sm:p-5 ${accent ? "glass-cta" : ""}`}>
      <div className="text-[10px] uppercase tracking-widest text-white/40 mb-1.5">{label}</div>
      <div
        className={`font-display text-lg sm:text-xl font-bold tnum ${
          accent ? "text-emerald-300" : "text-white/90"
        }`}
      >
        {value}
      </div>
      {sub && <div className="text-[10px] text-white/30 mt-0.5">{sub}</div>}
    </div>
  );
}

function LinkRow({ label, href, value }: { label: string; href: string; value: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center justify-between gap-3 rounded-xl bg-black/25 border border-white/6 px-3.5 py-2.5 hover:border-emerald-400/30 transition-colors group"
    >
      <span className="text-xs text-white/55">{label}</span>
      <span className="flex items-center gap-1.5 text-[11px] text-white/70 tnum group-hover:text-emerald-300 transition-colors">
        {value}
        <ExternalLink size={10} aria-hidden="true" />
      </span>
    </a>
  );
}
