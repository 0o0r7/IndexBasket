# Security Policy

## Scope

This project is a **testnet-only engineering demonstration**. In scope:

- The `IndexBasket.sol` contract and its deployment scripts (`contracts/`, `scripts/`)
- The frontend under `frontend/` (especially anything handling wallet
  connections, approvals, or transaction construction)
- CI workflows and the secrets flow around them (`.github/workflows/`)

Out of scope: Robinhood Chain infrastructure itself, the faucet contract,
Blockscout/Vercel platforms, and any claim of monetary loss (testnet assets
have no value by design).

## What we care about most

1. **Key handling** — any path where a private key could leak into the repo,
   logs, CI output, or the deployed frontend bundle.
2. **Rounding / accounting** — anything that could make the basket owe more
   components than it holds (the invariant is: rounding always favors the
   basket; see `docs/architecture.md`).
3. **Reentrancy** — `mint`/`redeem` entry points, malicious-token scenarios.
4. **Frontend truthfulness** — any way displayed values could diverge from
   on-chain state without being labeled.
5. **Supply-chain** — dependency and workflow changes that alter what CI
   executes with repository secrets.

## Responsible disclosure

Please use **GitHub Security Advisories** ("Report a vulnerability" on the
Security tab) rather than public issues, so fixes can land before exposure.

- Include: affected file/flow, a minimal reproduction, and (for on-chain
  issues) the network + tx hash if applicable.
- Acknowledgment target: within 72 hours.
- Please do not open public issues, PRs, or social posts for security
  findings before a fix is released.

## Deployment keys — how this repo stays safe

- Deployment credentials live only in a **GitHub Environment** secret
  (`BURNWALLET_PK`) plus a repository **variable** (`MAINWALLET_ADD`), scoped
  to the deploy workflow. They are injected as env vars and never echoed.
- The deployer key is a **testnet burner**: after `transferOwnership` it
  retains zero privileges (composition setup is one-time and owner-gated).
- `.env` is gitignored; `.env.example` documents the shape only.

## Design boundaries (why some "issues" are not)

- **No price oracle** — deliberate. Chainlink Stock Token feeds are
  mainnet-only; the contract tracks composition, not valuation.
- **Testnet-only** — deliberate. Do not report "cannot be used with real
  assets" as a vulnerability; it is the stated scope.
- **One-time `setComponents`** — deliberate irreversibility, documented in
  the contract NatSpec and the architecture docs.
