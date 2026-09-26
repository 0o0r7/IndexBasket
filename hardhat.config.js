require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

// Network parameters per https://docs.robinhood.com/chain/deploy-smart-contracts
// (testnet column). Verification goes through the Blockscout API on the
// official testnet explorer.
//
// Account resolution order (per deployment workflow):
//   1. BURNWALLET_PK  — burner deployer key (GitHub repo secret / local env)
//   2. PRIVATE_KEY    — generic fallback for local .env usage
// The key only ever lives in the environment or the gitignored .env file —
// it must never be hardcoded or committed.
function getDeployerAccounts() {
  if (process.env.BURNWALLET_PK) return [process.env.BURNWALLET_PK];
  if (process.env.PRIVATE_KEY) return [process.env.PRIVATE_KEY];
  return [];
}

module.exports = {
  solidity: "0.8.20",
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
  networks: {
    hardhat: {},
    robinhoodTestnet: {
      url: "https://rpc.testnet.chain.robinhood.com",
      chainId: 46630,
      accounts: getDeployerAccounts(),
    },
  },
  etherscan: {
    apiKey: {
      robinhoodTestnet: "empty",
    },
    customChains: [
      {
        network: "robinhoodTestnet",
        chainId: 46630,
        urls: {
          apiURL: "https://explorer.testnet.chain.robinhood.com/api/",
          browserURL: "https://explorer.testnet.chain.robinhood.com/",
        },
      },
    ],
  },
};
