// Explorer helpers — Robinhood Chain Testnet (docs.robinhood.com/chain/connecting)
export const EXPLORER_URL = "https://explorer.testnet.chain.robinhood.com";
export const FAUCET_URL = "https://faucet.testnet.chain.robinhood.com";
export const CHAIN_ID = 46630;

export function explorerAddressUrl(address: string): string {
  return `${EXPLORER_URL}/address/${address}`;
}

export function explorerTxUrl(hash: string): string {
  return `${EXPLORER_URL}/tx/${hash}`;
}
