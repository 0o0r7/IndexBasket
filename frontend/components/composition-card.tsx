"use client";

import { ExternalLink } from "lucide-react";
import type { Row } from "@/lib/use-basket";
import {
  COMPONENT_STYLE,
  fmtToken,
  referencePrice,
  fmtUsd,
  WAD,
} from "@/lib/contract";
import { explorerAddressUrl } from "@/lib/chain";

function styleFor(symbol: string) {
  return COMPONENT_STYLE[symbol] ?? COMPONENT_STYLE.DEFAULT;
}

export function weightBarStyle(rows: Row[]) {
  const known = rows.filter((r) => r.unitsPerShare > 0n);
  const total = known.reduce((acc, r) => acc + r.unitsPerShare, 0n);
  if (total === 0n) return [];
  return known.map((r, i) => ({
    key: `${r.index}-${r.token ?? "na"}-${i}`,
    symbol: r.symbol,
    pct: Number((r.unitsPerShare * 10_000n) / total) / 100,
    color: styleFor(r.symbol).color,
  }));
}

export function CompositionCard({
  rows,
  basketSymbol,
  loading,
}: {
  rows: Row[];
  basketSymbol: string;
  loading: boolean;
}) {
  const segments = weightBarStyle(rows);

  return (
    <section className="glass p-5 sm:p-6" aria-label="Basket composition">
      <div className="flex items-center justify-between mb-5">
        <h2 className="font-display text-sm font-semibold tracking-wide text-white/85">
          Basket Composition
        </h2>
        <span className="text-[11px] px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-white/60">
          on-chain weights
        </span>
      </div>

      {/* weight bar */}
      <div className="flex h-2.5 gap-0.5 rounded-full overflow-hidden mb-6" role="img" aria-label="Component weights">
        {segments.length === 0 ? (
          <div className="w-full shimmer rounded-full" />
        ) : (
          segments.map((s) => (
            <div
              key={s.key}
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${Math.max(s.pct, 2)}%`,
                background: `linear-gradient(180deg, ${s.color}, ${s.color}cc)`,
                boxShadow: `0 0 12px rgba(${styleFor(s.symbol).glow},0.5)`,
              }}
            />
          ))
        )}
      </div>

      <div className="space-y-4">
        {loading && rows.length === 0
          ? [0, 1, 2].map((i) => <SkeletonRow key={i} />)
          : rows.map((row) => <ComponentRow key={`${row.index}-${row.token ?? "na"}`} row={row} basketSymbol={basketSymbol} />)}
      </div>
    </section>
  );
}

function SkeletonRow() {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="w-2.5 h-2.5 rounded-full shimmer" />
        <div className="w-20 h-4 rounded shimmer" />
      </div>
      <div className="w-24 h-4 rounded shimmer" />
    </div>
  );
}

function ComponentRow({ row, basketSymbol }: { row: Row; basketSymbol: string }) {
  const s = styleFor(row.symbol);
  const weightPct = row.unitsPerShare > 0n ? Number((row.unitsPerShare * 10_000n) / WAD) / 100 : 0;
  const ref = referencePrice(row.symbol);

  return (
    <div className="group flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <span
          className="w-2.5 h-2.5 rounded-full shrink-0"
          style={{ background: s.color, boxShadow: `0 0 10px rgba(${s.glow},0.6)` }}
          aria-hidden="true"
        />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-white/90">{row.symbol}</span>
            {row.token && (
              <a
                href={explorerAddressUrl(row.token)}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`View ${row.symbol} token contract on the explorer`}
                className="text-white/25 hover:text-emerald-300 transition-colors"
              >
                <ExternalLink size={12} />
              </a>
            )}
          </div>
          <div className="text-[11px] text-white/40">
            {weightPct > 0 ? `${weightPct.toFixed(1)}% · ${fmtToken(row.unitsPerShare, row.decimals, 4)} per 1 ${basketSymbol || "share"}` : "…"}
          </div>
        </div>
      </div>

      <div className="text-right shrink-0">
        <div className="text-sm text-white/85 tnum">
          {row.userBalance !== null ? fmtToken(row.userBalance, row.decimals) : "—"}
        </div>
        <div className="text-[11px] text-white/40">
          {ref !== null ? (
            <span title="Illustrative reference value — not a live price feed">
              ~{fmtUsd(ref)} <span className="text-white/25">ref</span>
            </span>
          ) : (
            "your balance"
          )}
        </div>
      </div>
    </div>
  );
}
