import { useState } from "react";
import { Wallet, TrendingUp, RefreshCw, ArrowDownUp, ExternalLink, Info, CheckCircle2, AlertTriangle } from "lucide-react";

// ---------------------------------------------------------------------------
// CONFIG — real values from Robinhood Chain testnet research
// ---------------------------------------------------------------------------
const CHAIN = {
  id: 46630,
  name: "Robinhood Chain Testnet",
  rpc: "https://rpc.testnet.chain.robinhood.com",
  explorer: "https://explorer.testnet.chain.robinhood.com",
  faucet: "https://faucet.testnet.chain.robinhood.com",
};

// Basket composition — mirrors the pattern confirmed in the official
// Arbitrum Foundation Robinhood Chain basket example (testnet uses
// real faucet Stock Tokens: TSLA, AMZN, NFLX; mock feeds since the
// live Chainlink Stock Token feeds are mainnet-only).
const COMPONENTS = [
  { symbol: "TSLA", name: "Tesla Inc.", weight: 0.4, mockPrice: 245.32, color: "#ef4444" },
  { symbol: "AMZN", name: "Amazon.com Inc.", weight: 0.35, mockPrice: 178.91, color: "#f59e0b" },
  { symbol: "NFLX", name: "Netflix Inc.", weight: 0.25, mockPrice: 612.44, color: "#10b981" },
];

const BASKET = { name: "Builder Trio Index", symbol: "BTRIO" };

export default function App() {
  const [connected, setConnected] = useState(false);
  const [address, setAddress] = useState("");
  const [shares, setShares] = useState(0);
  const [balances, setBalances] = useState({ TSLA: 1.0, AMZN: 1.0, NFLX: 1.0 }); // demo faucet-style balances
  const [mintAmount, setMintAmount] = useState("1");
  const [activity, setActivity] = useState([]);
  const [tab, setTab] = useState("mint");
  const [connecting, setConnecting] = useState(false);

  const sharePrice = COMPONENTS.reduce((sum, c) => sum + c.mockPrice * c.weight, 0);

  const connectWallet = async () => {
    setConnecting(true);
    // Real flow: window.ethereum.request({ method: "eth_requestAccounts" })
    // then wallet_switchEthereumChain / wallet_addEthereumChain with CHAIN.id.
    // Simulated here since this preview has no injected wallet.
    await new Promise((r) => setTimeout(r, 600));
    setAddress("0x8f3a...9c21");
    setConnected(true);
    setConnecting(false);
  };

  const canMint = (n) => {
    const shareN = parseFloat(mintAmount) || 0;
    return COMPONENTS.every((c) => balances[c.symbol] >= c.weight * shareN);
  };

  const handleMint = () => {
    const n = parseFloat(mintAmount) || 0;
    if (n <= 0 || !canMint()) return;
    setBalances((prev) => {
      const next = { ...prev };
      COMPONENTS.forEach((c) => (next[c.symbol] = +(next[c.symbol] - c.weight * n).toFixed(6)));
      return next;
    });
    setShares((s) => +(s + n).toFixed(6));
    setActivity((a) => [
      { type: "Mint", amount: n, hash: "0x" + Math.random().toString(16).slice(2, 10) + "…", time: new Date().toLocaleTimeString() },
      ...a,
    ]);
    setMintAmount("1");
  };

  const handleRedeem = () => {
    const n = parseFloat(mintAmount) || 0;
    if (n <= 0 || n > shares) return;
    setBalances((prev) => {
      const next = { ...prev };
      COMPONENTS.forEach((c) => (next[c.symbol] = +(next[c.symbol] + c.weight * n).toFixed(6)));
      return next;
    });
    setShares((s) => +(s - n).toFixed(6));
    setActivity((a) => [
      { type: "Redeem", amount: n, hash: "0x" + Math.random().toString(16).slice(2, 10) + "…", time: new Date().toLocaleTimeString() },
      ...a,
    ]);
    setMintAmount("1");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-100">
      {/* Header */}
      <header className="border-b border-slate-800/80 backdrop-blur sticky top-0 z-10 bg-slate-950/70">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-400 to-lime-400 flex items-center justify-center">
              <TrendingUp size={18} className="text-slate-900" strokeWidth={2.5} />
            </div>
            <div>
              <div className="font-semibold text-sm leading-tight">{BASKET.name}</div>
              <div className="text-[11px] text-slate-500 leading-tight">Testnet Index Basket</div>
            </div>
          </div>
          <button
            onClick={connectWallet}
            disabled={connecting || connected}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-all ${
              connected
                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                : "bg-emerald-500 hover:bg-emerald-400 text-slate-900"
            }`}
          >
            <Wallet size={15} />
            {connecting ? "Connecting…" : connected ? address : "Connect Wallet"}
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        {/* Testnet disclosure banner */}
        <div className="mb-6 flex items-start gap-2.5 bg-amber-500/[0.07] border border-amber-500/20 rounded-xl px-4 py-3">
          <AlertTriangle size={16} className="text-amber-400 mt-0.5 shrink-0" />
          <p className="text-xs text-amber-200/80 leading-relaxed">
            <span className="font-medium text-amber-300">Testnet only — no financial value.</span> Component
            prices shown here are mock reference values, not live Chainlink feeds (Robinhood's live
            Stock Token price feeds are mainnet-only). Basket shares and Test ETH are not redeemable
            for anything of value.
          </p>
        </div>

        <div className="grid lg:grid-cols-5 gap-6">
          {/* Left: composition + chart */}
          <div className="lg:col-span-2 space-y-5">
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-slate-300">Basket Composition</h2>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400">{BASKET.symbol}</span>
              </div>

              {/* weight bar */}
              <div className="flex h-2.5 rounded-full overflow-hidden mb-4">
                {COMPONENTS.map((c) => (
                  <div key={c.symbol} style={{ width: `${c.weight * 100}%`, background: c.color }} />
                ))}
              </div>

              <div className="space-y-3">
                {COMPONENTS.map((c) => (
                  <div key={c.symbol} className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ background: c.color }} />
                      <div>
                        <div className="text-sm font-medium">{c.symbol}</div>
                        <div className="text-[11px] text-slate-500">{c.name}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm">${c.mockPrice.toFixed(2)}</div>
                      <div className="text-[11px] text-slate-500">{(c.weight * 100).toFixed(0)}% weight</div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-4 pt-4 border-t border-slate-800 flex items-center justify-between">
                <span className="text-xs text-slate-400">Reference share price</span>
                <span className="text-lg font-semibold text-emerald-400">${sharePrice.toFixed(2)}</span>
              </div>
            </div>

            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
              <h2 className="text-sm font-semibold text-slate-300 mb-3">Your Holdings</h2>
              <div className="space-y-2.5">
                {COMPONENTS.map((c) => (
                  <div key={c.symbol} className="flex justify-between text-sm">
                    <span className="text-slate-400">{c.symbol}</span>
                    <span>{balances[c.symbol].toFixed(4)}</span>
                  </div>
                ))}
                <div className="flex justify-between text-sm pt-2 border-t border-slate-800">
                  <span className="text-slate-300 font-medium">{BASKET.symbol} shares</span>
                  <span className="text-emerald-400 font-medium">{shares.toFixed(4)}</span>
                </div>
              </div>
            </div>

            <a
              href={CHAIN.faucet}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 text-xs text-slate-400 hover:text-slate-200 border border-slate-800 rounded-xl py-2.5 transition-colors"
            >
              Get testnet Stock Tokens from faucet <ExternalLink size={12} />
            </a>
          </div>

          {/* Right: mint/redeem panel */}
          <div className="lg:col-span-3 space-y-5">
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
              <div className="flex gap-1 bg-slate-950/60 rounded-xl p-1 mb-5 w-fit">
                <button
                  onClick={() => setTab("mint")}
                  className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    tab === "mint" ? "bg-emerald-500 text-slate-900" : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  Mint
                </button>
                <button
                  onClick={() => setTab("redeem")}
                  className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    tab === "redeem" ? "bg-emerald-500 text-slate-900" : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  Redeem
                </button>
              </div>

              {!connected ? (
                <div className="flex flex-col items-center justify-center py-14 text-center">
                  <Wallet size={28} className="text-slate-600 mb-3" />
                  <p className="text-sm text-slate-400 mb-1">Connect a wallet to continue</p>
                  <p className="text-xs text-slate-600">Robinhood Chain Testnet · Chain ID {CHAIN.id}</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="text-xs text-slate-500 mb-1.5 block">
                      {tab === "mint" ? "Basket shares to mint" : "Basket shares to redeem"}
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        value={mintAmount}
                        onChange={(e) => setMintAmount(e.target.value)}
                        min="0"
                        step="0.1"
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-lg font-medium focus:outline-none focus:border-emerald-500/50"
                      />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-slate-500">
                        {BASKET.symbol}
                      </span>
                    </div>
                  </div>

                  <ArrowDownUp size={16} className="text-slate-600 mx-auto" />

                  <div className="bg-slate-950/60 rounded-xl p-4 space-y-2">
                    <div className="text-xs text-slate-500 mb-2">
                      {tab === "mint" ? "You will provide" : "You will receive"}
                    </div>
                    {COMPONENTS.map((c) => {
                      const n = parseFloat(mintAmount) || 0;
                      const amt = +(c.weight * n).toFixed(4);
                      const insufficient = tab === "mint" && balances[c.symbol] < amt;
                      return (
                        <div key={c.symbol} className="flex justify-between text-sm">
                          <span className="text-slate-400">{c.symbol}</span>
                          <span className={insufficient ? "text-rose-400" : "text-slate-200"}>{amt}</span>
                        </div>
                      );
                    })}
                  </div>

                  {tab === "mint" ? (
                    <button
                      onClick={handleMint}
                      disabled={!canMint()}
                      className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-800 disabled:text-slate-600 text-slate-900 font-medium transition-colors"
                    >
                      {canMint() ? `Mint ${mintAmount || 0} ${BASKET.symbol}` : "Insufficient component balance"}
                    </button>
                  ) : (
                    <button
                      onClick={handleRedeem}
                      disabled={parseFloat(mintAmount) > shares || !mintAmount}
                      className="w-full py-3 rounded-xl bg-slate-100 hover:bg-white disabled:bg-slate-800 disabled:text-slate-600 text-slate-900 font-medium transition-colors"
                    >
                      Redeem {mintAmount || 0} {BASKET.symbol}
                    </button>
                  )}

                  <div className="flex items-start gap-2 text-[11px] text-slate-600">
                    <Info size={13} className="mt-0.5 shrink-0" />
                    <span>
                      Mint pulls component tokens via ERC-20 approve + transferFrom in one transaction. Redeem
                      burns shares and returns components — it never reads a price feed, only the contract's
                      recorded composition.
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Activity log */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <RefreshCw size={13} className="text-slate-500" />
                <h2 className="text-sm font-semibold text-slate-300">Recent Activity</h2>
              </div>
              {activity.length === 0 ? (
                <p className="text-xs text-slate-600 py-6 text-center">No transactions yet this session</p>
              ) : (
                <div className="space-y-2">
                  {activity.map((a, i) => (
                    <div key={i} className="flex items-center justify-between text-sm py-1.5">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 size={13} className="text-emerald-500" />
                        <span className={a.type === "Mint" ? "text-emerald-400" : "text-slate-300"}>{a.type}</span>
                        <span className="text-slate-500">{a.amount} {BASKET.symbol}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-[11px] text-slate-600">{a.time}</span>
                        <span className="text-[11px] text-slate-600 font-mono">{a.hash}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <footer className="mt-10 pt-6 border-t border-slate-800/60 text-center">
          <p className="text-[11px] text-slate-600">
            {CHAIN.name} · Chain ID {CHAIN.id} · Independent testnet demo, not affiliated with or endorsed by Robinhood
          </p>
        </footer>
      </main>
    </div>
  );
}
