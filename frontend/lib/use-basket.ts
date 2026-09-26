"use client";

import { useAccount, useReadContracts } from "wagmi";
import { BASKET_ADDRESS, basketAbi, erc20Abi } from "./contract";

export type Row = {
  index: number;
  token: `0x${string}`;
  unitsPerShare: bigint;
  symbol: string;
  decimals: number;
  userBalance: bigint | null;
  allowance: bigint | null;
};

type BasketMeta = {
  name: string;
  symbol: string;
  totalSupply: bigint;
  initialized: boolean;
  owner: string | null;
  componentsLength: number;
  yourShares: bigint | null;
};

// ---------------------------------------------------------------------------
// All chain reads, batched through Multicall3 via three stable
// useReadContracts hooks (stage 1: basket meta -> stage 2: composition slots
// -> stage 3: per-token data). Hook count never varies between renders.
// ---------------------------------------------------------------------------
export function useBasketData() {
  const { address } = useAccount();
  const enabled = BASKET_ADDRESS !== null;

  // --- stage 1: basket meta + user share balance ---------------------------
  const metaContracts = [
    { abi: basketAbi, address: BASKET_ADDRESS!, functionName: "name" } as const,
    { abi: basketAbi, address: BASKET_ADDRESS!, functionName: "symbol" } as const,
    { abi: basketAbi, address: BASKET_ADDRESS!, functionName: "totalSupply" } as const,
    { abi: basketAbi, address: BASKET_ADDRESS!, functionName: "initialized" } as const,
    { abi: basketAbi, address: BASKET_ADDRESS!, functionName: "owner" } as const,
    { abi: basketAbi, address: BASKET_ADDRESS!, functionName: "componentsLength" } as const,
    ...(address
      ? [{ abi: basketAbi, address: BASKET_ADDRESS!, functionName: "balanceOf", args: [address] } as const]
      : []),
  ];
  const metaHook = useReadContracts({
    contracts: metaContracts,
    query: { enabled, retry: 1 },
  });

  const metaRes = metaHook.data ?? [];
  const name = (metaRes[0]?.result as string) ?? "";
  const symbol = (metaRes[1]?.result as string) ?? "";
  const totalSupply = (metaRes[2]?.result as bigint) ?? 0n;
  const initialized = (metaRes[3]?.result as boolean) ?? false;
  const owner = (metaRes[4]?.result as string) ?? null;
  const componentsLength = Number((metaRes[5]?.result as bigint) ?? 0n);
  const yourShares = address ? ((metaRes[6]?.result as bigint | undefined) ?? null) : null;

  // --- stage 2: composition slots ------------------------------------------
  const slotContracts = Array.from({ length: componentsLength }, (_, i) =>
    ({ abi: basketAbi, address: BASKET_ADDRESS!, functionName: "components", args: [BigInt(i)] } as const)
  );
  const slotsHook = useReadContracts({
    contracts: slotContracts,
    query: { enabled: enabled && componentsLength > 0, retry: 1 },
  });

  const tokens = (slotsHook.data ?? [])
    .map((s) => (s.result as [string, bigint] | undefined)?.[0])
    .filter((t): t is `0x${string}` => typeof t === "string");

  // --- stage 3: per-token data ---------------------------------------------
  // group layout when a wallet is connected: [symbol, decimals, balance, allowance]
  // when not connected: [symbol, decimals]
  const G = address ? 4 : 2;
  const tokenContracts = tokens.flatMap((t) => {
    const base = [
      { abi: erc20Abi, address: t, functionName: "symbol" } as const,
      { abi: erc20Abi, address: t, functionName: "decimals" } as const,
    ];
    if (!address) return base;
    return [
      ...base,
      { abi: erc20Abi, address: t, functionName: "balanceOf", args: [address] } as const,
      { abi: erc20Abi, address: t, functionName: "allowance", args: [address, BASKET_ADDRESS!] } as const,
    ];
  });
  const tokenHook = useReadContracts({
    contracts: tokenContracts,
    query: { enabled: tokens.length > 0, retry: 1 },
  });

  const rows: Row[] = tokens.map((token, i) => {
    const g = tokenHook.data?.slice(i * G, i * G + G) ?? [];
    return {
      index: i,
      token,
      unitsPerShare: ((slotsHook.data?.[i]?.result as [string, bigint] | undefined)?.[1]) ?? 0n,
      symbol: (g[0]?.result as string) ?? "…",
      decimals: (g[1]?.result as number) ?? 18,
      userBalance: address ? ((g[2]?.result as bigint | undefined) ?? null) : null,
      allowance: address ? ((g[3]?.result as bigint | undefined) ?? null) : null,
    };
  });

  const isLoading =
    metaHook.isLoading ||
    (componentsLength > 0 && slotsHook.isLoading) ||
    (tokens.length > 0 && tokenHook.isLoading);

  const refetchAll = () => {
    metaHook.refetch();
    slotsHook.refetch();
    tokenHook.refetch();
  };

  const meta: BasketMeta = {
    name,
    symbol,
    totalSupply,
    initialized,
    owner,
    componentsLength,
    yourShares,
  };

  return { meta, rows, isLoading, refetchAll };
}
