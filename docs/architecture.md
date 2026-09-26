# Architecture

Deep-dive reference for the IndexBasket protocol and its frontend. For the short
version see the [README](../README.md#architecture). Every design decision here traces to a
test in [`test/IndexBasket.test.js`](../test/IndexBasket.test.js).

## 1. Contract: `IndexBasket.sol`

An ERC-20 ("Builder Trio Index", `BTRIO`) whose shares represent a fixed claim on a basket of
component tokens. `0.8.20`, OpenZeppelin Contracts **v5** (`ERC20`, `Ownable(msg.sender)`,
`ReentrancyGuard` from `utils/`, `SafeERC20`).

### State

```solidity
struct Component { IERC20 token; uint256 unitsPerShare; }
Component[] public components;   // set once, forever
bool public initialized;         // one-time setup latch
```

`unitsPerShare` is the raw amount of that component (in the token's own decimals) backing
`1e18` basket shares ("1.0"). For the live deployment with 18-decimal components and weights
0.4 / 0.35 / 0.25: `4e17 / 3.5e17 / 2.5e17`.

### External surface

| Function | Access | Behavior |
|---|---|---|
| `constructor(name_, symbol_)` | deployer | Mints nothing; owner = `msg.sender` |
| `setComponents(tokens, unitsPerShare)` | owner, once | Stores composition, sets `initialized`, emits `ComponentsSet`. Reverts `AlreadyInitialized` / `LengthMismatch` / `EmptyComponents` on misuse |
| `mint(sharesOut)` | anyone | Pulls `ceil(unitsPerShare × sharesOut / 1e18)` of **every** component via `safeTransferFrom` (caller must pre-approve), then mints shares. Reverts `NotInitialized` / `ZeroShares` |
| `redeem(sharesIn)` | anyone | Burns the caller's shares first, then sends `floor(unitsPerShare × sharesIn / 1e18)` of every component back. Reverts `NotInitialized` / `ZeroShares` (and on ERC-20 failure — e.g. insufficient basket balance, which cannot happen while rounding favors the basket) |
| `componentsLength()` | view | Number of components |
| `componentBalances()` | view | Basket's live balance of each component |
| `owner()` | view | Inherited; can `transferOwnership` |

Custom errors: `AlreadyInitialized`, `NotInitialized`, `LengthMismatch`, `ZeroShares`,
`EmptyComponents`. Events: `ComponentsSet`, `Minted(user, shares, amountsIn)`,
`Redeemed(user, shares, amountsOut)`.

### Rounding — the core invariant

```
mint:   amountIn  = ceil(unitsPerShare * sharesOut / 1e18)   // user pays rounding dust
redeem: amountOut = floor(unitsPerShare * sharesIn / 1e18)   // basket keeps rounding dust
```

Both directions round **in the basket's favor**, so `componentBalances() >= sum over
holders of (shares × unitsPerShare / 1e18)` holds at all times. The test suite pins exact
literals: minting 1 share with a 0.4 weight requires `400000000000000001` units when the
fair value is `400000000000000000.4`-style non-integer division; redeeming symmetric
amounts pays out the floored value.

### Reentrancy posture

- `mint` / `redeem` are `nonReentrant`.
- `redeem` burns shares **before** any external token transfer (checks-effects-interactions).
- All token moves go through OZ `SafeERC20`.
- A dedicated malicious-token mock (`contracts/mocks/ReentrantToken.sol`, attack modes for
  re-entering `mint` / `redeem`) proves both doors are shut.

### Ownership & lifecycle

```
deploy ──► setComponents ──► transferOwnership(mainWallet) ──► verify owner() on-chain
             (one-time)          (handover; burner keeps nothing)
```

The deploy script (`scripts/deploy.js`) enforces this ordering deliberately: if ownership
were transferred before composition was set and the burner then discarded the key, the
basket would be permanently uninitializable. After the handover the script re-reads
`owner()` from chain and hard-fails on mismatch, then writes `deployments/testnet.json`.

## 2. Frontend data flow

Next.js 16 App Router + wagmi v2 + viem + Tailwind CSS 4. Only **injected** connectors are
enabled (EIP-6963 multi-wallet discovery, with a legacy `window.ethereum` fallback) — no
WalletConnect project ID is needed to run the app.

**Reads** — every displayed number (supply, weights, balances, allowances, quotes) comes
from live contract reads, batched through **Multicall3** in three stages: basket metadata →
component metadata → user balances/allowances. Quotes are computed client-side with the same
ceil/floor rules the contract uses, so the UI quote always matches the eventual on-chain
execution (the tests assert the exact literals for both).

**Writes** — the mint flow is a small state machine: read allowances → request missing
approvals → `mint` → wait → re-read state. Redeem blocks attempting to burn more than the
holder's balance (which would revert on-chain).

**Configuration**

- Basket address: `NEXT_PUBLIC_BASKET_ADDRESS` if set, else the bundled
  `frontend/lib/deployments.json` snapshot synced from `deployments/testnet.json`
  by `scripts/sync-deployments.mjs` before `dev`/`build`. If neither exists the app shows an
  explicit not-deployed state — it never displays a placeholder address.
- Chain definition (id 46630, RPC, explorer, faucet) lives in `lib/chain.ts`.
- Reference prices are clearly-labeled illustrative constants; the UI marks them as such
  wherever they appear.

**Health surface** — `/health` runs 11 browser-side probes (RPC chain id & block, explorer
API, bytecode existence, metadata reads, components vs snapshot, decimals, owner vs
snapshot, address source, wallet provider probe) plus a raw EIP-1193 connect drill with
`eth_requestAccounts` → `wallet_switchEthereumChain` → `wallet_addEthereumChain` fallback
reporting. `frontend/scripts/healthcheck.mjs` is the headless CLI twin (9 checks) used by CI.

## 3. Deployment topology

| Piece | Where | Credentials |
|---|---|---|
| Contract source of truth | this repo, `contracts/` | — |
| Deploy pipeline | GitHub Actions `deploy.yml` (manual dispatch) | Environment-scoped secrets: `BURNWALLET_PK` (secret), `MAINWALLET_ADD` (variable) |
| Verification | Blockscout explorer API via hardhat `customChains` | none (public API) |
| App hosting | Vercel (`builder-trio-index.vercel.app`) | `NEXT_PUBLIC_BASKET_ADDRESS` env |
| Monitoring | `ci.yml` (push/PR), `healthcheck.yml` (push/manual/daily cron) | none |
