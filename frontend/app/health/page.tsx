"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createPublicClient, http, type PublicClient } from "viem";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  Loader2,
  Play,
  RefreshCw,
  XCircle,
  AlertTriangle,
} from "lucide-react";
import { robinhoodTestnet } from "@/lib/wagmiConfig";
import { BASKET_ADDRESS, basketAbi, erc20Abi } from "@/lib/contract";
import { CHAIN_ID, EXPLORER_URL, FAUCET_URL } from "@/lib/chain";
import deploymentSnapshot from "@/lib/deployments.json";

type Status = "idle" | "running" | "pass" | "warn" | "fail";

type Check = {
  id: string;
  group: "Network" | "Contract" | "Frontend config" | "Wallet";
  label: string;
  status: Status;
  detail: string;
  ms: number | null;
};

type Eip6963Provider = { info: { uuid: string; name: string; rdns: string }; provider: unknown };

const RPC_URL = robinhoodTestnet.rpcUrls.default.http[0];

const INITIAL_CHECKS: Check[] = [
  { id: "rpc-chainid", group: "Network", label: "RPC eth_chainId", status: "idle", detail: "", ms: null },
  { id: "rpc-block", group: "Network", label: "RPC block production", status: "idle", detail: "", ms: null },
  { id: "explorer", group: "Network", label: "Explorer API (Blockscout v2)", status: "idle", detail: "", ms: null },
  { id: "code", group: "Contract", label: "Bytecode at basket address", status: "idle", detail: "", ms: null },
  { id: "meta", group: "Contract", label: "name / symbol / totalSupply / initialized", status: "idle", detail: "", ms: null },
  { id: "components", group: "Contract", label: "Components match deployment record", status: "idle", detail: "", ms: null },
  { id: "decimals", group: "Contract", label: "Component decimals = 18", status: "idle", detail: "", ms: null },
  { id: "owner", group: "Contract", label: "Ownership matches deployment record", status: "idle", detail: "", ms: null },
  { id: "addr-source", group: "Frontend config", label: "Basket address source", status: "idle", detail: "", ms: null },
  { id: "chain-const", group: "Frontend config", label: "Chain constants", status: "idle", detail: "", ms: null },
  { id: "wallet-probe", group: "Wallet", label: "Injected wallet detection (EIP-1193 / EIP-6963)", status: "idle", detail: "", ms: null },
];

type Step = { label: string; status: Status; detail: string };

function short(a: string): string {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`timeout after ${ms}ms`)), ms)),
  ]);
}

export default function HealthPage() {
  const [checks, setChecks] = useState<Check[]>(INITIAL_CHECKS);
  const [running, setRunning] = useState(false);
  const [hasRun, setHasRun] = useState(false);
  const clientRef = useRef<PublicClient | null>(null);
  void clientRef;

  const [walletSteps, setWalletSteps] = useState<Step[] | null>(null);
  const [walletBusy, setWalletBusy] = useState(false);

  const patch = useCallback((id: string, p: Partial<Check>) => {
    setChecks((prev) => prev.map((c) => (c.id === id ? { ...c, ...p } : c)));
  }, []);

  const runAll = useCallback(async () => {
    setRunning(true);
    setChecks(INITIAL_CHECKS.map((c) => ({ ...c })));
    const client = createPublicClient({
      chain: robinhoodTestnet,
      transport: http(RPC_URL, { timeout: 10_000 }),
    });
    clientRef.current = client;
    const snap = deploymentSnapshot as {
      contractAddress?: string | null;
      finalOwner?: string | null;
      components?: { symbol: string; address: string }[];
    };
    const address = BASKET_ADDRESS;

    // ------------------------------------------------------------- network
    patch("rpc-chainid", { status: "running" });
    const t0 = Date.now();
    try {
      const id = (await withTimeout(client.getChainId(), 9000)) as number;
      const t = Date.now() - t0;
      id === CHAIN_ID
        ? patch("rpc-chainid", { status: "pass", detail: `chainId ${id} (expected ${CHAIN_ID})`, ms: t })
        : patch("rpc-chainid", { status: "fail", detail: `chainId ${id}, expected ${CHAIN_ID}`, ms: t });
    } catch (e) {
      patch("rpc-chainid", { status: "fail", detail: String(e).slice(0, 140), ms: Date.now() - t0 });
    }

    patch("rpc-block", { status: "running" });
    const t1 = Date.now();
    try {
      const bn = (await withTimeout(client.getBlockNumber(), 9000)) as bigint;
      patch("rpc-block", {
        status: bn > 0n ? "pass" : "warn",
        detail: `block #${bn.toString()}`,
        ms: Date.now() - t1,
      });
    } catch (e) {
      patch("rpc-block", { status: "fail", detail: String(e).slice(0, 140), ms: Date.now() - t1 });
    }

    patch("explorer", { status: "running" });
    const t2 = Date.now();
    try {
      const res = await withTimeout(fetch(`${EXPLORER_URL}/api/v2/stats`), 9000);
      patch("explorer", {
        status: res.ok ? "pass" : "warn",
        detail: `HTTP ${res.status} from /api/v2/stats`,
        ms: Date.now() - t2,
      });
    } catch (e) {
      patch("explorer", { status: "warn", detail: `unreachable: ${String(e).slice(0, 100)}`, ms: Date.now() - t2 });
    }

    // ------------------------------------------------------------ contract
    if (address === null) {
      for (const id of ["code", "meta", "components", "decimals", "owner"]) {
        patch(id, { status: "fail", detail: "no basket address configured" });
      }
    } else {
      patch("code", { status: "running" });
      const t3 = Date.now();
      try {
        const code = (await withTimeout(client.getBytecode({ address }), 9000)) as `0x${string}` | null;
        const size = code ? (code.length - 2) / 2 : 0;
        patch("code", {
          status: size > 100 ? "pass" : "fail",
          detail: size > 0 ? `${size} bytes of deployed bytecode` : "no bytecode — not deployed here",
          ms: Date.now() - t3,
        });
      } catch (e) {
        patch("code", { status: "fail", detail: String(e).slice(0, 140), ms: Date.now() - t3 });
      }

      patch("meta", { status: "running" });
      const t4 = Date.now();
      try {
        const [name, symbol, supply, initialized] = await Promise.all([
          withTimeout(client.readContract({ abi: basketAbi, address, functionName: "name" }) as Promise<string>, 9000),
          withTimeout(client.readContract({ abi: basketAbi, address, functionName: "symbol" }) as Promise<string>, 9000),
          withTimeout(client.readContract({ abi: basketAbi, address, functionName: "totalSupply" }) as Promise<bigint>, 9000),
          withTimeout(client.readContract({ abi: basketAbi, address, functionName: "initialized" }) as Promise<boolean>, 9000),
        ]);
        const ok = name === "Builder Trio Index" && symbol === "BTRIO" && initialized;
        patch("meta", {
          status: ok ? "pass" : "warn",
          detail: `${name} (${symbol}) · supply ${supply.toString()} wei · initialized=${initialized}`,
          ms: Date.now() - t4,
        });
      } catch (e) {
        patch("meta", { status: "fail", detail: String(e).slice(0, 140), ms: Date.now() - t4 });
      }

      patch("components", { status: "running" });
      const t5 = Date.now();
      try {
        const len = Number(
          (await withTimeout(client.readContract({ abi: basketAbi, address, functionName: "componentsLength" }) as Promise<bigint>, 9000)).toString()
        );
        const slots: [string, bigint][] = [];
        for (let i = 0; i < len; i++) {
          slots.push(
            (await withTimeout(
              client.readContract({ abi: basketAbi, address, functionName: "components", args: [BigInt(i)] }) as Promise<[string, bigint]>,
              9000
            ))
          );
        }
        const expected = snap.components ?? [];
        const match =
          len === expected.length &&
          slots.every((s, i) => s[0].toLowerCase() === expected[i]?.address.toLowerCase());
        patch("components", {
          status: match ? "pass" : "warn",
          detail:
            `${len} components: ` +
            slots
              .map(
                (s, i) =>
                  `${expected[i]?.symbol ?? "?"} ${short(s[0])} @ ${Number((s[1] * 100n) / 10n ** 18n)}%`
              )
              .join(" · "),
          ms: Date.now() - t5,
        });
      } catch (e) {
        patch("components", { status: "fail", detail: String(e).slice(0, 140), ms: Date.now() - t5 });
      }

      patch("decimals", { status: "running" });
      const t6 = Date.now();
      try {
        const tokens = (snap.components ?? []).map((c) => c.address as `0x${string}`);
        const decs = await Promise.all(
          tokens.map((t) =>
            withTimeout(client.readContract({ abi: erc20Abi, address: t, functionName: "decimals" }) as Promise<number>, 9000)
          )
        );
        const all18 = decs.every((d) => d === 18);
        patch("decimals", {
          status: all18 ? "pass" : "warn",
          detail: tokens.map((t, i) => `${short(t)}=${decs[i]}`).join(" · "),
          ms: Date.now() - t6,
        });
      } catch (e) {
        patch("decimals", { status: "fail", detail: String(e).slice(0, 140), ms: Date.now() - t6 });
      }

      patch("owner", { status: "running" });
      const t7 = Date.now();
      try {
        const owner = (await withTimeout(client.readContract({ abi: basketAbi, address, functionName: "owner" }) as Promise<string>, 9000)).toLowerCase();
        const expectedOwner = (snap.finalOwner ?? "").toLowerCase();
        patch("owner", {
          status: owner === expectedOwner ? "pass" : "warn",
          detail:
            owner === expectedOwner
              ? `owner ${short(owner)} matches deployment record (main wallet)`
              : `owner ${owner} ≠ record ${expectedOwner || "(none recorded)"}`,
          ms: Date.now() - t7,
        });
      } catch (e) {
        patch("owner", { status: "fail", detail: String(e).slice(0, 140), ms: Date.now() - t7 });
      }
    }

    // ------------------------------------------------------ frontend config
    const envAddr = process.env.NEXT_PUBLIC_BASKET_ADDRESS;
    patch("addr-source", {
      status: address ? "pass" : "fail",
      detail: address
        ? envAddr && envAddr !== snap.contractAddress
          ? `env override ${short(address)} (differs from snapshot)`
          : `snapshot deployments/testnet.json → ${short(address)}`
        : "no address resolved — UI shows not-deployed state",
      ms: null,
    });
    patch("chain-const", {
      status: "pass",
      detail: `CHAIN_ID=${CHAIN_ID} · RPC ${RPC_URL.replace("https://", "")} · faucet ${FAUCET_URL.replace("https://", "")}`,
      ms: null,
    });

    // -------------------------------------------------------------- wallet
    patch("wallet-probe", { status: "running" });
    const t8 = Date.now();
    try {
      const found = await scanEip6963();
      const w = window as unknown as { ethereum?: { isMetaMask?: boolean } };
      const has1193 = typeof w.ethereum !== "undefined";
      if (found.length > 0) {
        patch("wallet-probe", {
          status: "pass",
          detail: `EIP-6963 wallets: ${found.map((f) => f.info.name).join(", ")}`,
          ms: Date.now() - t8,
        });
      } else if (has1193) {
        patch("wallet-probe", {
          status: "pass",
          detail: `legacy window.ethereum present${w.ethereum?.isMetaMask ? " (MetaMask)" : ""}`,
          ms: Date.now() - t8,
        });
      } else {
        patch("wallet-probe", {
          status: "warn",
          detail: "no injected wallet detected in this browser — install MetaMask to mint/redeem",
          ms: Date.now() - t8,
        });
      }
    } catch (e) {
      patch("wallet-probe", { status: "warn", detail: String(e).slice(0, 140), ms: Date.now() - t8 });
    }

    setHasRun(true);
    setRunning(false);
  }, [patch]);

  // auto-run once on mount
  useEffect(() => {
    runAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Raw EIP-1193 connect drill — shows exactly where a wallet flow breaks. */
  async function runWalletDrill() {
    setWalletSteps(null);
    setWalletBusy(true);
    const steps: Step[] = [];
    const push = (label: string, status: Status, detail: string) =>
      steps.push({ label, status, detail });
    try {
      const w = window as unknown as {
        ethereum?: {
          request: (a: { method: string; params?: unknown[] | object }) => Promise<unknown>;
        };
      };
      const eth = w.ethereum;
      if (!eth?.request) {
        push("Provider", "fail", "window.ethereum missing — no injected wallet in this browser.");
        setWalletSteps([...steps]);
        return;
      }
      push("Provider", "pass", "window.ethereum present.");

      let accounts: string[];
      try {
        accounts = (await eth.request({ method: "eth_requestAccounts" })) as string[];
        push("Accounts", accounts?.length ? "pass" : "fail", accounts?.length ? `granted ${short(accounts[0])}` : "empty account list");
        if (!accounts?.length) { setWalletSteps([...steps]); return; }
      } catch (e) {
        push("Accounts", "fail", `eth_requestAccounts rejected: ${String(e).slice(0, 160)}`);
        setWalletSteps([...steps]);
        return;
      }

      try {
        const chainIdHex = (await eth.request({ method: "eth_chainId" })) as string;
        const id = parseInt(chainIdHex, 16);
        push("Chain", id === CHAIN_ID ? "pass" : "warn", `wallet on chainId ${id} (${id === CHAIN_ID ? "matches" : "expected 46630"})`);
        if (id !== CHAIN_ID) {
          try {
            await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0xb626" }] });
            push("Switch", "pass", "wallet_switchEthereumChain succeeded → 46630");
          } catch (se) {
            const code = (se as { code?: number })?.code;
            if (code === 4902) {
              try {
                await eth.request({
                  method: "wallet_addEthereumChain",
                  params: [
                    {
                      chainId: "0xb626",
                      chainName: "Robinhood Chain Testnet",
                      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
                      rpcUrls: [RPC_URL],
                      blockExplorerUrls: [EXPLORER_URL],
                    },
                  ],
                });
                push("Switch", "pass", "chain 46630 added to wallet (wallet_addEthereumChain)");
              } catch (ae) {
                push("Switch", "fail", `add chain rejected: ${String(ae).slice(0, 140)}`);
              }
            } else {
              push("Switch", "fail", `switch rejected (code ${code ?? "?"}) — approve it in the wallet popup`);
            }
          }
        }
      } catch (e) {
        push("Chain", "fail", `eth_chainId failed: ${String(e).slice(0, 140)}`);
        setWalletSteps([...steps]);
        return;
      }

      push("Done", "pass", "Wallet drill complete — if every step passed, the app connect flow will work.");
      setWalletSteps([...steps]);
    } finally {
      setWalletBusy(false);
    }
  }

  const groups: Check["group"][] = ["Network", "Contract", "Frontend config", "Wallet"];
  const overall: Status = (() => {
    const s = checks.map((c) => c.status);
    if (s.includes("fail")) return "fail";
    if (s.includes("warn") || s.includes("running")) return "warn";
    return "pass";
  })();

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-40 border-b border-white/8 bg-black/55 backdrop-blur-xl">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-3.5 flex items-center justify-between gap-3">
          <Link
            href="/"
            className="flex items-center gap-1 text-[11px] text-white/50 hover:text-emerald-300 transition-colors"
          >
            <ArrowLeft size={12} aria-hidden="true" /> Back
          </Link>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-white/40">System Health</span>
            <OverallDot status={hasRun && !running ? overall : "running"} />
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-4xl mx-auto px-4 sm:px-6 py-7 space-y-6">
        <section className="glass p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="font-display text-xl font-bold">Troubleshooter & Debugger</h1>
              <p className="text-xs text-white/45 mt-1 max-w-xl leading-relaxed">
                Live diagnostics against the real Robinhood Chain Testnet RPC, the deployed
                IndexBasket contract, the explorer API and this browser&apos;s injected wallet.
                Nothing here is mocked — every check is an actual call made when this page runs.
              </p>
            </div>
            <button
              onClick={runAll}
              disabled={running}
              className="flex items-center gap-2 text-xs font-semibold px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-400 to-lime-300 text-black transition-transform enabled:hover:scale-[1.03] disabled:opacity-70"
            >
              {running ? (
                <Loader2 size={13} className="animate-spin" aria-hidden="true" />
              ) : (
                <RefreshCw size={13} aria-hidden="true" />
              )}
              {running ? "Running…" : "Re-run all checks"}
            </button>
          </div>
        </section>

        {groups.map((g) => (
          <section key={g} className="glass p-5 sm:p-6" aria-label={g}>
            <h2 className="font-display text-sm font-semibold tracking-wide text-white/85 mb-4">
              {g}
            </h2>
            <div className="space-y-2">
              {checks
                .filter((c) => c.group === g)
                .map((c) => (
                  <div
                    key={c.id}
                    className="flex items-start gap-3 rounded-xl bg-black/25 border border-white/6 px-3.5 py-3"
                  >
                    <StatusIcon status={c.status} />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs text-white/75">{c.label}</div>
                      {c.detail && (
                        <div className="text-[11px] text-white/45 tnum break-words mt-0.5">{c.detail}</div>
                      )}
                    </div>
                    {c.ms !== null && (
                      <span className="text-[10px] text-white/30 tnum shrink-0 mt-0.5">{c.ms}ms</span>
                    )}
                  </div>
                ))}
            </div>
          </section>
        ))}

        <section className="glass p-5 sm:p-6" aria-label="Wallet connect drill">
          <h2 className="font-display text-sm font-semibold tracking-wide text-white/85">
            Wallet connect drill
          </h2>
          <p className="text-xs text-white/45 mt-1 mb-4 leading-relaxed">
            Runs the raw EIP-1193 flow (detect → request accounts → read chainId → switch if
            needed) and reports every step. If connect fails in the app, run this to see exactly
            which step breaks. Requires an injected wallet in this browser.
          </p>
          <button
            onClick={runWalletDrill}
            disabled={walletBusy}
            className="flex items-center gap-2 text-xs font-semibold px-4 py-2.5 rounded-xl bg-white/8 border border-white/15 text-white/85 transition-colors hover:border-emerald-400/40 disabled:opacity-70"
          >
            {walletBusy ? (
              <Loader2 size={13} className="animate-spin" aria-hidden="true" />
            ) : (
              <Play size={13} aria-hidden="true" />
            )}
            {walletBusy ? "Drill running…" : "Run wallet connect drill"}
          </button>

          {walletSteps && (
            <ol className="mt-4 space-y-2">
              {walletSteps.map((s, i) => (
                <li
                  key={i}
                  className="flex items-start gap-3 rounded-xl bg-black/25 border border-white/6 px-3.5 py-3"
                >
                  <StatusIcon status={s.status} />
                  <div className="min-w-0">
                    <div className="text-xs text-white/75 flex items-center gap-1">
                      {s.label} <ChevronRight size={10} className="text-white/25" aria-hidden="true" />
                    </div>
                    <div className="text-[11px] text-white/45 tnum break-words mt-0.5">{s.detail}</div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>

        <p className="text-[11px] text-white/30 px-1 leading-relaxed">
          Expected baseline on a healthy deployment: RPC pass/pass, explorer pass, bytecode pass,
          name/symbol pass (Builder Trio Index · BTRIO), 3 components pass, decimals pass, owner
          pass, address source pass, chain constants pass. The wallet row shows <em>warn</em> when
          this browser has no injected wallet — that is informational, not an outage. Explore the
          contract on{" "}
          <a href={EXPLORER_URL} target="_blank" rel="noopener noreferrer" className="text-emerald-300/80 hover:text-emerald-300">
            the explorer
          </a>{" "}
          or grab test funds from{" "}
          <a href={FAUCET_URL} target="_blank" rel="noopener noreferrer" className="text-emerald-300/80 hover:text-emerald-300">
            the faucet
          </a>
          .
        </p>
      </main>
    </div>
  );
}

function StatusIcon({ status }: { status: Status }) {
  if (status === "running") return <Loader2 size={14} className="animate-spin text-white/50 mt-0.5 shrink-0" aria-hidden="true" />;
  if (status === "pass") return <CheckCircle2 size={14} className="text-emerald-400 mt-0.5 shrink-0" aria-hidden="true" />;
  if (status === "warn") return <AlertTriangle size={14} className="text-amber-400 mt-0.5 shrink-0" aria-hidden="true" />;
  if (status === "fail") return <XCircle size={14} className="text-rose-400 mt-0.5 shrink-0" aria-hidden="true" />;
  return null;
}

function OverallDot({ status }: { status: Status }) {
  const color =
    status === "pass"
      ? "bg-emerald-400"
      : status === "warn"
        ? "bg-amber-400"
        : status === "fail"
          ? "bg-rose-400"
          : "bg-white/40";
  return <span className={`w-2 h-2 rounded-full ${color}`} aria-label={`overall ${status}`} />;
}

/** EIP-6963 wallet discovery: announce window + requestProvider round-trip. */
function scanEip6963(timeoutMs = 700): Promise<Eip6963Provider[]> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") return resolve([]);
    const found: Eip6963Provider[] = [];
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<Eip6963Provider>).detail;
      if (detail?.info) found.push(detail);
    };
    window.addEventListener("eip6963:announceProvider", handler as EventListener);
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    setTimeout(() => {
      window.removeEventListener("eip6963:announceProvider", handler as EventListener);
      resolve(found);
    }, timeoutMs);
  });
}
