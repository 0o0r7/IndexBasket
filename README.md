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

## Deployment record (live on testnet)

All values below were produced by the CI deploy pipeline
(`.github/workflows/deploy.yml`, run history in the Actions tab) and
independently re-verified against the RPC + explorer. The machine-readable
record lives in [`deployments/testnet.json`](deployments/testnet.json).

| Artifact | Value |
|---|---|
| Contract | [`0xdFB8775FF189254bCa8E328bea60d261DDF01F4f`](https://explorer.testnet.chain.robinhood.com/address/0xdFB8775FF189254bCa8E328bea60d261DDF01F4f) — verified source |
| Deploy tx | [`0xd3c715a1b9e04c1e67cf184a7fa7a3139720f6b104cfeceb588a29e8f3d80de8`](https://explorer.testnet.chain.robinhood.com/tx/0xd3c715a1b9e04c1e67cf184a7fa7a3139720f6b104cfeceb588a29e8f3d80de8) (block 124774758) |
| `setComponents` tx | [`0xb914c62769426643ad76e57fd7f95ec83855d04f1cd8765b475a22bd0adf1f7d`](https://explorer.testnet.chain.robinhood.com/tx/0xb914c62769426643ad76e57fd7f95ec83855d04f1cd8765b475a22bd0adf1f7d) |
| `transferOwnership` tx | [`0xcabbd4b2535524dd42d375a956ab6963a178fd3953cea509f031088232e3a4cf`](https://explorer.testnet.chain.robinhood.com/tx/0xcabbd4b2535524dd42d375a956ab6963a178fd3953cea509f031088232e3a4cf) |
| Owner (on-chain `owner()`) | `0xd57bC3482F32acFD5B52efb723288376aE1b2Fd2` (main wallet; burner retains no privileges) |

Component tokens are the faucet-confirmed testnet Stock Tokens (18 decimals):
TSLA `0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E` (40%), AMZN
`0x5884aD2f920c162CFBbACc88C9C51AA75eC09E02` (35%), NFLX
`0x3b8262A63d25f0477c4DDE23F83cfe22Cb768C93` (25%). The testnet also contains
same-ticker counterfeit tokens — a matching ticker does **not** identify a
Robinhood Stock Token; these addresses were confirmed from the faucet
contract's on-chain distributions.

## Frontend

`frontend/` is a fresh Next.js 16 + wagmi v2 + viem app (Tailwind CSS 4).
Every balance, weight, supply and quote is read live from the chain
(Multicall3-batched); the only static numbers are the clearly-labeled
illustrative reference prices. The basket address is resolved from
`NEXT_PUBLIC_BASKET_ADDRESS` or the bundled `deployments/testnet.json`
snapshot (synced at build time).

```bash
cd frontend
npm install
npm run dev    # http://localhost:3000
```

## Local development (contract)

```bash
npm install
npx hardhat test          # 25 tests: setComponents / mint / redeem / reentrancy
npx hardhat compile
```

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
