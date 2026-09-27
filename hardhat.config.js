import "dotenv/config";
import hardhatToolboxMochaEthers from "@nomicfoundation/hardhat-toolbox-mocha-ethers";
import { defineConfig } from "hardhat/config";

// ---------------------------------------------------------------------------
// Robinhood Chain Testnet — official endpoints (chain docs), chainId 46630.
// Hardhat 3 notes:
//  - Projects must be ESM ("type": "module" in package.json).
//  - etherscan.customChains is gone: verification is provider-based, with a
//    native Blockscout provider. The explorer is declared per-chain via
//    `chainDescriptors` and enabled via `verify.blockscout`.
//  - The toolbox for a Mocha + ethers.js JS/TS project is
//    @nomicfoundation/hardhat-toolbox-mocha-ethers (the old
//    hardhat-toolbox@>=6 is an intentional dead-end shim).
// ---------------------------------------------------------------------------
const EXPLORER_URL = "https://explorer.testnet.chain.robinhood.com";

export default defineConfig({
  plugins: [hardhatToolboxMochaEthers],

  solidity: {
    profiles: {
      default: {
        version: "0.8.20",
      },
      production: {
        version: "0.8.20",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    },
  },

  networks: {
    robinhoodTestnet: {
      type: "http",
      chainId: 46630,
      url: "https://rpc.testnet.chain.robinhood.com",
      accounts: process.env.BURNWALLET_PK ? [process.env.BURNWALLET_PK] : [],
    },
  },

  chainDescriptors: {
    46630: {
      name: "Robinhood Chain Testnet",
      blockExplorers: {
        blockscout: {
          url: EXPLORER_URL,
          apiUrl: `${EXPLORER_URL}/api/`,
        },
      },
    },
  },

  verify: {
    blockscout: {
      enabled: true,
    },
  },
});
