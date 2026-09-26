# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and the project versions with [Semantic Versioning](https://semver.org/).

## [1.0.0] — 2026-09-27

First complete, production-hosted release of the basket protocol and its
frontend on Robinhood Chain Testnet (chain ID 46630).

### Added

- **Contract** — `IndexBasket.sol` (Solidity ^0.8.20, OpenZeppelin v5):
  ERC-20 basket shares (`BTRIO`); weighted deposit-to-mint with
  **ceil rounding**, burn-to-redeem with **floor rounding** (dust stays in
  the basket); one-time owner-gated `setComponents`; `ReentrancyGuard` on
  both flows; `SafeERC20` transfers; custom errors; full NatSpec.
- **Tests** — 25-case Hardhat suite: composition setup, exact rounding
  literals, access control, double-init revert, malicious-token reentrancy
  blockers, ERC-20 accounting.
- **Deployment** — `scripts/deploy.js` (deploy → setComponents →
  transferOwnership → on-chain owner confirmation → machine-readable
  record), `scripts/verify-args.js`, Blockscout source verification via
  Hardhat custom chain config.
- **CI pipelines** — `deploy.yml` (manual dispatch: compile → test → deploy
  → verify → commit record), `healthcheck.yml` (push/manual/daily: 9 live
  checks), `ci.yml` (push/PR: compile + tests + frontend build).
- **Frontend** — Next.js 16 + wagmi v2 + viem + Tailwind CSS 4 app:
  Multicall3-batched live reads, approve→mint state machine, redeem with
  over-balance guard, EIP-6963 injected-wallet connect with chain
  switch/add prompts, explicit not-deployed state, labeled illustrative
  reference prices only.
- **Health tooling** — in-app `/health` troubleshooter (11 live checks +
  raw EIP-1193 connect drill), CLI healthcheck script, scheduled CI gate.
- **E2E** — Playwright connect-flow suite with a simulated EIP-1193
  provider (clearly labeled as simulated), covering first-connect and
  eager-reconnect scenarios.
- **Repository hygiene** — MIT license, contribution & security policies,
  code of conduct, issue/PR templates, Dependabot (npm + GitHub Actions),
  architecture and verification docs, live-app screenshot.

### Fixed

- OpenZeppelin v4→v5 import-path conflict (`ReentrancyGuard` now imported
  from `utils/`); documented in-file, zero logic changes.
- Dead-end "Connect wallet" CTA — the app previously rendered no real
  connect flow; now wired through a shared wallet hook with install
  detection and granular error reporting.
- Intermittent React #418 hydration race on eager wallet reconnect — fixed
  with a full app-shell mounted gate.

### Removed

- Internal working notes file (`agent_prompt_final ver.md`) that had been
  uploaded early and never belonged in the repository.
- Superseded prototype component (`frontend/legacy/`) — preserved in git
  history at commit `c92161d`.

### Deployment record (this release)

- Basket: [`0xdFB8775FF189254bCa8E328bea60d261DDF01F4f`](https://explorer.testnet.chain.robinhood.com/address/0xdFB8775FF189254bCa8E328bea60d261DDF01F4f) (source verified)
- Owner: `0xd57bC3482F32acFD5B52efb723288376aE1b2Fd2` (on-chain confirmed)
- App: <https://builder-trio-index.vercel.app>

[1.0.0]: https://github.com/0o0r7/IndexBasket/releases/tag/v1.0.0
