const { task } = require("hardhat/config");
require("@nomiclabs/hardhat-ethers");
require("hardhat-deploy");
require("@nomiclabs/hardhat-waffle");

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
    robinhood: {
      url: "https://rpc.testnet.chain.robinhood.com",
      chainId: 46630,
      accounts: [], // Burner wallet details will be added here in Phase 2
    },
  },
};