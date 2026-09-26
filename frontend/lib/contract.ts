import { parseAbi } from "viem";
import robinhoodDeployments from "./deployments.json";

// ---------------------------------------------------------------------------
// Contract addressing
// ---------------------------------------------------------------------------
// Resolution order:
//   1. NEXT_PUBLIC_BASKET_ADDRESS — explicit env override (Vercel / .env.local)
//   2. lib/deployments.json — build-time snapshot of the real deployment
//      record written by scripts/deploy.js (see frontend/scripts/sync-deployments.mjs)
// There is no fallback beyond these two: if neither exists, the UI renders an
// explicit "not deployed" state instead of guessing an address.
const ENV_ADDRESS = process.env.NEXT_PUBLIC_BASKET_ADDRESS as string | undefined;

function resolveAddress(): `0x${string}` | null {
  if (ENV_ADDRESS && /^0x[a-fA-F0-9]{40}$/.test(ENV_ADDRESS)) {
    return ENV_ADDRESS as `0x${string}`;
  }
  const snap = robinhoodDeployments as { contractAddress?: string | null };
  if (
    snap?.contractAddress &&
    /^0x[a-fA-F0-9]{40}$/.test(snap.contractAddress)
  ) {
    return snap.contractAddress as `0x${string}`;
  }
  return null;
}

export const BASKET_ADDRESS = resolveAddress();

// ---------------------------------------------------------------------------
// ABIs — minimal, only what the UI reads/writes
// ---------------------------------------------------------------------------
export const basketAbi = parseAbi([
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function initialized() view returns (bool)",
  "function owner() view returns (address)",
  "function componentsLength() view returns (uint256)",
  "function components(uint256) view returns (address token, uint256 unitsPerShare)",
  "function componentBalances() view returns (uint256[])",
  "function mint(uint256 sharesOut)",
  "function redeem(uint256 sharesIn)",
  "event Minted(address indexed user, uint256 shares, uint256[] amountsIn)",
  "event Redeemed(address indexed user, uint256 shares, uint256[] amountsOut)",
]);

export const erc20Abi = parseAbi([
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
]);

// ---------------------------------------------------------------------------
// Display metadata (static by nature — brand colors / long names; all
// NUMBERS in the UI come from the chain, never from this table)
// ---------------------------------------------------------------------------
export const COMPONENT_STYLE: Record<string, { color: string; glow: string }> = {
  TSLA: { color: "#ef4444", glow: "239,68,68" },
  AMZN: { color: "#f59e0b", glow: "245,158,11" },
  NFLX: { color: "#10b981", glow: "16,185,129" },
  DEFAULT: { color: "#a3e635", glow: "163,230,53" },
};

// Clearly-labeled ILLUSTRATIVE reference prices (USD). The contract reads no
// price feed anywhere — these exist only for the reference valuation card and
// are labeled as illustrative in the UI. Not live market data.
export const REFERENCE_PRICES: Record<string, number> = {
  TSLA: 245.32,
  AMZN: 178.91,
  NFLX: 612.44,
};

export function referencePrice(symbol: string): number | null {
  return REFERENCE_PRICES[symbol] ?? null;
}

// ---------------------------------------------------------------------------
// Math mirrors (BigInt) — exactly the contract's rounding semantics
// mint pulls ceil(U*S/1e18); redeem pays floor(U*S/1e18)
// ---------------------------------------------------------------------------
export const WAD = 10n ** 18n;

export function quoteMintIn(unitsPerShare: bigint, shares: bigint): bigint {
  const product = unitsPerShare * shares;
  return product / WAD + (product % WAD === 0n ? 0n : 1n);
}

export function quoteRedeemOut(unitsPerShare: bigint, shares: bigint): bigint {
  return (unitsPerShare * shares) / WAD;
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------
export function fmtToken(value: bigint, decimals: number, maxFrac = 6): string {
  if (decimals === 0) return value.toString();
  const base = 10n ** BigInt(decimals);
  const whole = value / base;
  const frac = value % base;
  const fracStr = frac.toString().padStart(decimals, "0").slice(0, maxFrac).replace(/0+$/, "");
  const wholeStr = whole.toLocaleString("en-US");
  return fracStr ? `${wholeStr}.${fracStr}` : wholeStr;
}

export function fmtUsd(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export function shortAddr(a: string): string {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}
