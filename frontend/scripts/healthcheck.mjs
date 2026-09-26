// Repository-level health check for the IndexBasket project.
// Verifies, with REAL calls only:
//   1. Robinhood Testnet RPC (chainId + block production)
//   2. Deployed contract bytecode + name/symbol/initialized
//   3. On-chain owner == deployment record (main wallet)
//   4. On-chain components == deployment record (faucet trio @ 40/35/25)
//   5. Explorer (Blockscout v2) API reachable
//   6. Production site up + its JS bundle carries the real contract address
// Exit code 0 = healthy, 1 = at least one FAIL.
// Run: node frontend/scripts/healthcheck.mjs  (from repo root)

import { readFile } from "node:fs/promises";
import { createPublicClient, http, defineChain } from "viem";

const RPC = "https://rpc.testnet.chain.robinhood.com";
const EXPLORER = "https://explorer.testnet.chain.robinhood.com";
const SITE = process.env.HEALTHCHECK_SITE_URL ?? "https://builder-trio-index.vercel.app";
const CHAIN_ID = 46630;

const chain = defineChain({
  id: CHAIN_ID,
  name: "Robinhood Chain Testnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
  blockExplorers: { default: { name: "Explorer", url: EXPLORER } },
});

const results = [];
function record(id, ok, detail, warn = false) {
  const status = ok ? "PASS" : warn ? "WARN" : "FAIL";
  results.push({ id, status, detail });
  const line = `[${status}] ${id.padEnd(28)} ${detail}`;
  console.log(ok || warn ? `\x1b[32m${line}\x1b[0m` : `\x1b[31m${line}\x1b[0m`);
}

const snap = JSON.parse(await readFile(new URL("../lib/deployments.json", import.meta.url), "utf8"));
const ADDRESS = process.env.NEXT_PUBLIC_BASKET_ADDRESS ?? snap.contractAddress;

const client = createPublicClient({ chain, transport: http(RPC, { timeout: 15_000 }) });

// 1. RPC ------------------------------------------------------------
try {
  const id = await client.getChainId();
  record("rpc.chainId", id === CHAIN_ID, `chainId ${id} (expected ${CHAIN_ID})`);
} catch (e) {
  record("rpc.chainId", false, String(e).slice(0, 120));
}
try {
  const bn = await client.getBlockNumber();
  record("rpc.blockNumber", bn > 0n, `block #${bn}`);
} catch (e) {
  record("rpc.blockNumber", false, String(e).slice(0, 120));
}

// 2-4. Contract ------------------------------------------------------
if (!/^0x[a-fA-F0-9]{40}$/.test(ADDRESS ?? "")) {
  record("contract.address", false, "no valid basket address in env/snapshot");
} else {
  const abi = [
    { name: "name", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
    { name: "symbol", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
    { name: "initialized", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "bool" }] },
    { name: "owner", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
    { name: "componentsLength", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
    {
      name: "components", type: "function", stateMutability: "view",
      inputs: [{ type: "uint256" }], outputs: [{ type: "address" }, { type: "uint256" }],
    },
  ];
  try {
    const code = await client.getBytecode({ address: ADDRESS });
    const size = code ? (code.length - 2) / 2 : 0;
    record("contract.bytecode", size > 100, `${size} bytes at ${ADDRESS}`);
  } catch (e) {
    record("contract.bytecode", false, String(e).slice(0, 120));
  }
  try {
    const [name, symbol, initialized, owner, len] = await Promise.all([
      client.readContract({ abi, address: ADDRESS, functionName: "name" }),
      client.readContract({ abi, address: ADDRESS, functionName: "symbol" }),
      client.readContract({ abi, address: ADDRESS, functionName: "initialized" }),
      client.readContract({ abi, address: ADDRESS, functionName: "owner" }),
      client.readContract({ abi, address: ADDRESS, functionName: "componentsLength" }),
    ]);
    record(
      "contract.identity",
      name === "Builder Trio Index" && symbol === "BTRIO" && initialized === true,
      `${name} (${symbol}) initialized=${initialized}`
    );
    const ownerOk = snap.finalOwner && owner.toLowerCase() === snap.finalOwner.toLowerCase();
    record(
      "contract.owner",
      ownerOk,
      ownerOk ? `owner ${owner} == main wallet (record)` : `owner ${owner} != record ${snap.finalOwner}`
    );
    const n = Number(len);
    const slots = [];
    for (let i = 0; i < n; i++) {
      slots.push(await client.readContract({ abi, address: ADDRESS, functionName: "components", args: [BigInt(i)] }));
    }
    const compsOk =
      n === (snap.components?.length ?? -1) &&
      slots.every((s, i) => s[0].toLowerCase() === snap.components[i].address.toLowerCase());
    record(
      "contract.components",
      compsOk,
      compsOk
        ? `${n} slots match record: ${snap.components.map((c) => c.symbol).join("/")}`
        : "on-chain components differ from deployment record"
    );
  } catch (e) {
    record("contract.identity", false, String(e).slice(0, 120));
  }
}

// 5. Explorer ---------------------------------------------------------
try {
  const res = await fetch(`${EXPLORER}/api/v2/stats`);
  record("explorer.api", res.ok, `HTTP ${res.status} from /api/v2/stats`);
} catch (e) {
  record("explorer.api", false, String(e).slice(0, 120));
}

// 6. Production site ---------------------------------------------------
try {
  const res = await fetch(SITE);
  record("site.http", res.ok, `HTTP ${res.status} from ${SITE}`);
  if (res.ok) {
    const html = await res.text();
    const chunks = [...new Set(html.match(/\/_next\/static\/[^"]+\.js/g) ?? [])].slice(0, 16);
    const target = (ADDRESS ?? "").toLowerCase();
    let found = html.toLowerCase().includes(target);
    for (const c of chunks) {
      if (found) break;
      const js = await fetch(new URL(c, SITE)).then((r) => r.text());
      if (js.toLowerCase().includes(target)) found = true;
    }
    record("site.bundleAddress", found, found ? `address ${ADDRESS} present in served bundle` : "address NOT found in bundle");
  }
} catch (e) {
  record("site.http", false, String(e).slice(0, 120));
}

// summary --------------------------------------------------------------
const fails = results.filter((r) => r.status === "FAIL").length;
const warns = results.filter((r) => r.status === "WARN").length;
console.log(`\n${results.length} checks: ${results.length - fails - warns} pass, ${warns} warn, ${fails} fail`);
process.exit(fails > 0 ? 1 : 0);
