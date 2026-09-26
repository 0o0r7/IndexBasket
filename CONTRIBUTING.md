# Contributing to IndexBasket

Thanks for your interest in improving the project. This repository has a
deliberately small surface, so the contributing rules are simple — but they
are enforced, because the project's core promise is *honesty*: nothing here
may pretend, fake, or overstate.

## Ground rules

1. **No fabricated values.** Addresses, transaction hashes, balances, and
   deployment records must come from real chain interactions. If a change
   touches the deployment record, it must be produced by
   `scripts/deploy.js` in CI — never hand-edited.
2. **No scope creep on the contract.** The economics are fixed:
   deposit-to-mint, burn-to-redeem, one-time composition. No price feed, no
   swaps, no fees. If your idea changes the economics, open an issue first.
3. **Testnet only.** Anything that would encourage or enable mainnet use is
   out of scope (see SECURITY.md and the license notice).
4. **Tests travel with changes.** Contract behavior changes need test
   coverage in the same PR; frontend behavior changes should keep
   `frontend/e2e/` green.

## Development setup

Prerequisites: Node.js ≥ 20, npm ≥ 10.

```bash
git clone https://github.com/0o0r7/IndexBasket.git
cd IndexBasket
npm install
npx hardhat test          # contract suite — expect 25 passing

cd frontend
npm install
npm run dev               # http://localhost:3000
```

Frontend env vars (all optional): `NEXT_PUBLIC_BASKET_ADDRESS` overrides the
bundled deployment snapshot. Nothing else is required for read-only mode.

## Commit and PR conventions

- Commits follow [Conventional Commits](https://www.conventionalcommits.org/):
  `feat:`, `fix:`, `docs:`, `chore:`, `ci:`, `test:`, `refactor:`.
- Keep PRs focused; one logical change per PR.
- CI must be green (compile + 25 tests + frontend build). The healthcheck
  workflow runs on pushes to `main` — do not weaken it.
- Update `CHANGELOG.md` under an *Unreleased* heading for user-visible
  changes.

## PR checklist

- [ ] `npx hardhat test` passes locally (25/25)
- [ ] `cd frontend && npm run build` succeeds
- [ ] No secrets, private keys, or fabricated chain data introduced
- [ ] Docs updated (README / docs/) if behavior or commands changed
- [ ] CHANGELOG.md updated for user-visible changes

## Reporting issues

Use the issue templates. For wallet/connection problems, run the in-app
troubleshooter at `/health` and paste the results — it saves a round trip.
Security-sensitive findings go through the process in
[SECURITY.md](SECURITY.md), not public issues.
