# IndexBasket — Robinhood Chain Testnet

Minimal, honest index basket over **real faucet Stock Tokens** (RH-TSLA,
RH-AMZN, RH-NFLX) on Robinhood Chain Testnet. No price feed is read on-chain
— the contract only tracks composition (fixed units of each component per
share), so every claim it makes is verifiable against its own state.

## Why this design
Robinhood Chain's live Chainlink Stock Token price feeds are **mainnet-only**.
Rather than faking a price feed on testnet, this basket avoids pricing
entirely: mint = deposit exact weighted components, redeem = burn shares and
get components back. Composition is on-chain truth; pricing is left to the
frontend as clearly-labeled reference data.

## Network
| | |
|---|---|
| Chain ID | `46630` |
| RPC | `https://rpc.testnet.chain.robinhood.com` |
| Explorer | `https://explorer.testnet.chain.robinhood.com` |
| Faucet | `https://faucet.testnet.chain.robinhood.com` |

## Setup

```bash
mkdir index-basket && cd index-basket
npm init -y
npm install --save-dev hardhat @nomicfoundation/hardhat-toolbox
npm install @openzeppelin/contracts
npx hardhat init   # choose "Create a JavaScript project"
```

Replace `contracts/IndexBasket.sol` with the contract from this project,
and `hardhat.config.js` with:

```javascript
require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

module.exports = {
  solidity: "0.8.20",
  networks: {
    robinhoodTestnet: {
      url: "https://rpc.testnet.chain.robinhood.com",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 46630,
    },
  },
};
```

`.env` (never commit this):
```
PRIVATE_KEY=0xYourBurnerWalletKey
```

## Deploy script — `scripts/deploy.js`

```javascript
const hre = require("hardhat");

// TODO: replace with real faucet Stock Token addresses on testnet —
// get these from https://faucet.testnet.chain.robinhood.com after
// claiming, or from the explorer's token list. Do not guess addresses.
const COMPONENT_TOKENS = [
  "0x0000000000000000000000000000000000TSLA", // RH-TSLA
  "0x0000000000000000000000000000000000AMZN", // RH-AMZN
  "0x0000000000000000000000000000000000NFLX", // RH-NFLX
];

// Units of each component (in that token's own decimals) per 1.0 share.
// Example assumes 18 decimals and weights 0.4 / 0.35 / 0.25:
const UNITS_PER_SHARE = [
  hre.ethers.parseUnits("0.4", 18),
  hre.ethers.parseUnits("0.35", 18),
  hre.ethers.parseUnits("0.25", 18),
];

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log(`Deploying with: ${deployer.address}`);

  const Basket = await hre.ethers.deployContract("IndexBasket", [
    "Builder Trio Index",
    "BTRIO",
  ]);
  await Basket.waitForDeployment();
  const address = await Basket.getAddress();
  console.log(`IndexBasket deployed: ${address}`);

  const tx = await Basket.setComponents(COMPONENT_TOKENS, UNITS_PER_SHARE);
  await tx.wait();
  console.log(`Components set: ${tx.hash}`);

  console.log(`\nVerify on explorer:`);
  console.log(`https://explorer.testnet.chain.robinhood.com/address/${address}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

Run it:
```bash
npx hardhat run scripts/deploy.js --network robinhoodTestnet
```

## Verification (required — do not skip)

After deploy, open the printed explorer URL yourself and confirm:
- The contract exists and its bytecode is non-empty
- `componentsLength()` returns `3`
- `componentBalances()` matches what you'd expect after a test mint

Do **not** consider this "done" until you've clicked the explorer link
yourself and seen a real, verified contract — not just a printed address.

## What this is / is not
- ✅ Real ERC-20 mechanics, real faucet Stock Tokens, real on-chain state
- ✅ Fully auditable: every number the frontend shows comes from a contract read
- ❌ Not a price oracle, not investment advice, not affiliated with Robinhood
- ❌ Testnet only — BTRIO shares and Test ETH have no monetary value
