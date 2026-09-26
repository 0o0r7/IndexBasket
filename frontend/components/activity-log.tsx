"use client";

import { CheckCircle2, ExternalLink, Loader2, RefreshCw, XCircle } from "lucide-react";
import { explorerTxUrl } from "@/lib/chain";
import type { ActivityEntry } from "./action-panel";

export function ActivityLog({ entries }: { entries: ActivityEntry[] }) {
  return (
    <section className="glass p-5 sm:p-6" aria-label="Recent activity">
      <div className="flex items-center gap-2 mb-4">
        <RefreshCw size={13} className="text-emerald-300/70" aria-hidden="true" />
        <h2 className="font-display text-sm font-semibold tracking-wide text-white/85">
          Recent Activity
        </h2>
        <span className="text-[10px] uppercase tracking-widest text-white/30 ml-1">
          this session · live receipts
        </span>
      </div>

      {entries.length === 0 ? (
        <p className="text-xs text-white/30 py-8 text-center">
          No transactions yet this session — every hash below will come from a real receipt.
        </p>
      ) : (
        <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
          {entries.map((e) => (
            <div
              key={e.id}
              className="flex items-center justify-between gap-3 rounded-xl bg-black/25 border border-white/6 px-3.5 py-2.5 fade-up"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                {e.status === "pending" ? (
                  <Loader2 size={14} className="text-amber-300 animate-spin shrink-0" aria-hidden="true" />
                ) : e.status === "confirmed" ? (
                  <CheckCircle2 size={14} className="text-emerald-400 shrink-0" aria-hidden="true" />
                ) : (
                  <XCircle size={14} className="text-rose-400 shrink-0" aria-hidden="true" />
                )}
                <span
                  className={`text-sm truncate ${
                    e.kind === "mint"
                      ? "text-emerald-300"
                      : e.kind === "redeem"
                        ? "text-white/80"
                        : "text-white/55"
                  }`}
                >
                  {e.label}
                </span>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-[10px] text-white/30 tnum hidden sm:inline">
                  {new Date(e.at).toLocaleTimeString()}
                </span>
                <a
                  href={explorerTxUrl(e.hash)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-[11px] text-white/45 hover:text-emerald-300 tnum transition-colors"
                  aria-label={`View transaction ${e.hash} on the explorer`}
                >
                  {e.hash.slice(0, 10)}…{e.hash.slice(-6)}
                  <ExternalLink size={10} />
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
