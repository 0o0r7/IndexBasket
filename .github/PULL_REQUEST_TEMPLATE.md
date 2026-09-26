<!-- Title format: conventional-commit style, e.g. "feat: add X" / "fix: handle Y" -->

## What does this PR change?

<!-- One or two sentences. -->

## Why?

<!-- Link the issue: "Closes #123". For contract changes, explain the safety argument. -->

## Scope guard (contract PRs)

- [ ] This PR does **not** change basket economics (mint/redeem math, weights, fees, oracle) — or the deviation is explicitly agreed in an issue first

## Evidence (repo rule: verifiable claims only)

- [ ] `npx hardhat test` — 25/25 passing locally
- [ ] `cd frontend && npm run build` succeeds
- [ ] No secrets, private keys, or hand-fabricated chain data introduced
- [ ] Any new addresses/tx hashes link to the explorer

## Docs & changelog

- [ ] README / docs/ updated if commands or behavior changed
- [ ] CHANGELOG.md updated under *Unreleased* (user-visible changes only)
