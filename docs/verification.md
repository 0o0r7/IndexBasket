# Independent verification runbook

Every claim made in this repository's README should be reproducible by anyone, without
trusting the authors. This document lists each artifact and the exact command or link that
verifies it. Commands use plain `curl` against public endpoints.

**Constants used below**

```
RPC=https://rpc.testnet.chain.robinhood.com
API=https://explorer.testnet.chain.robinhood.com/api
BASKET=0xdFB8775FF189254bCa8E328bea60d261DDF01F4f
OWNER=0xd57bC3482F32acFD5B52efb723288376aE1b2Fd2
TSLA=0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E
AMZN=0x5884aD2f920c162CFBbACc88C9C51AA75eC09E02
NFLX=0x3b8262A63d25f0477c4DDE23F83cfe22Cb768C93
FAUCET=0x8762F93772c663c6a88Ba50900bd5381df2717Be
```

## 1. Contract exists & source is verified

- Explorer UI: <https://explorer.testnet.chain.robinhood.com/address/0xdFB8775FF189254bCa8E328bea60d261DDF01F4f> — the page must show **Contract Source Code** (not just bytecode).
- API:

```bash
curl -s "$API?module=contract&action=getcontractinfo&address=$BASKET" \
  | python3 -c "import sys,json; d=json.load(sys.stdin)['result']; print('verified:', d['is_verified'], '| name:', d.get('name'), '| compiler:', d.get('compiler_version'))"
```

## 2. Deployment transactions (real, successful, decoded)

| Tx | Explorer link |
|---|---|
| Deploy | <https://explorer.testnet.chain.robinhood.com/tx/0xd3c715a1b9e04c1e67cf184a7fa7a3139720f6b104cfeceb588a29e8f3d80de8> (block 124774758) |
| setComponents | <https://explorer.testnet.chain.robinhood.com/tx/0xb914c62769426643ad76e57fd7f95ec83855d04f1cd8765b475a22bd0adf1f7d> |
| transferOwnership | <https://explorer.testnet.chain.robinhood.com/tx/0xcabbd4b2535524dd42d375a956ab6963a178fd3953cea509f031088232e3a4cf> |

```bash
curl -s "$API?module=transaction&action=gettxinfo&txhash=0xd3c715a1b9e04c1e67cf184a7fa7a3139720f6b104cfeceb588a29e8f3d80de8" \
  | python3 -c "import sys,json; d=json.load(sys.stdin)['result']; print('status:', d['status'], '| block:', d['blockNumber'], '| to:', d['to'])"
```

## 3. On-chain state via RPC (`eth_call`, no indexer in the middle)

```bash
# owner() == the main wallet (selector 0x8da5cb5b)
curl -s -X POST $RPC -H 'Content-Type: application/json' -d \
  '{"jsonrpc":"2.0","id":1,"method":"eth_call","params":[{"to":"'"$BASKET"'","data":"0x8da5cb5b"},"latest"]}' \
  | python3 -c "import sys,json; r=json.load(sys.stdin)['result']; print('owner: 0x'+r[-40:])"
# expected: 0xd57bC3482F32acFD5B52efb723288376aE1b2Fd2

# initialized() == true (selector 0x158ef93e)
curl -s -X POST $RPC -H 'Content-Type: application/json' -d \
  '{"jsonrpc":"2.0","id":1,"method":"eth_call","params":[{"to":"'"$BASKET"'","data":"0x158ef93e"},"latest"]}'
# expected result: 0x...01

# componentsLength() == 3 (selector 0x14ff6ce7)
curl -s -X POST $RPC -H 'Content-Type: application/json' -d \
  '{"jsonrpc":"2.0","id":1,"method":"eth_call","params":[{"to":"'"$BASKET"'","data":"0x14ff6ce7"},"latest"]}'
# expected result: 0x...03
```

Selector derivation, if you want to check them yourself: `cast sig "owner()"`, or
`keccak256("owner()")[0:4]` etc. — selectors above correspond to `owner()`,
`initialized()`, `componentsLength()` on the deployed contract.

## 4. Component tokens trace to the faucet (anti-counterfeit evidence)

The testnet contains many same-ticker counterfeits, so addresses were **not** taken from any
token list. They were traced from the official faucet's on-chain distributions:

1. Open the faucet contract on the explorer:
   <https://explorer.testnet.chain.robinhood.com/address/0x8762F93772c663c6a88Ba50900bd5381df2717Be>
2. List its outgoing token transfers (Blockscout API v2):

```bash
curl -s "$API/v2/addresses/$FAUCET/token-transfers" \
  | python3 -c "
import sys, json
for t in json.load(sys.stdin)['items'][:50]:
    tok = t.get('token')
    if tok:
        print(tok['symbol'], tok['address'], 'decimals:', tok.get('decimals'))"
```

3. Every Stock Token distributed by `sendTokensAndEther` claims is minted from the zero
   address by the token contract the faucet hands out — those contracts are the canonical
   testnet Stock Tokens (the trio above are the 18-decimal, highest-holder canonical
   variants). Verify each token's decimals == 18 on its explorer page before trusting it.

## 5. Frontend serves real data

```bash
curl -s https://builder-trio-index.vercel.app -o /tmp/app.html -w '%{http_code}\n'
# 200

curl -s https://builder-trio-index.vercel.app/health -o /tmp/health.html -w '%{http_code}\n'
# 200 — then open /health in a browser for the 11 live probes + wallet drill
```

The production bundle must embed the real basket address (grep the served JS chunks for
`0xdFB8775FF189254bCa8E328bea60d261DDF01F4f`). The in-app `/health` page automates the
full check set from *your* browser; `node frontend/scripts/healthcheck.mjs` does the same
headless (9 checks), and CI runs it on every push plus a daily schedule.

## 6. Tests actually pass

```bash
npm install && npx hardhat test
# expect: 25 passing
```

The CI workflow (Actions tab → `ci`) runs the same suite on every push and pull request —
its history is public evidence of continuous green.
