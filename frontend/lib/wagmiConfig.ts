import { http, createConfig } from "wagmi";
import { defineChain } from "viem";
import { injected } from "wagmi/connectors";

// Robinhood Chain Testnet — parameters per https://docs.robinhood.com/chain/connecting
export const robinhoodTestnet = defineChain({
  id: 46630,
  name: "Robinhood Chain Testnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.testnet.chain.robinhood.com"] },
  },
  blockExplorers: {
    default: {
      name: "Robinhood Testnet Explorer",
      url: "https://explorer.testnet.chain.robinhood.com",
    },
  },
  // Multicall3 is canonically deployed on the testnet (verified on-chain:
  // eth_getCode at 0xcA11…CA11 returns runtime bytecode) — enables batched reads.
  multicall3: {
    address: "0xcA11bde05977b3631167028862bE2a173976CA11",
  },
  testnet: true,
});

export const wagmiConfig = createConfig({
  chains: [robinhoodTestnet],
  connectors: [injected({ shimDisconnect: true })],
  transports: {
    [robinhoodTestnet.id]: http("https://rpc.testnet.chain.robinhood.com"),
  },
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
