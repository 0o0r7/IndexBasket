require("dotenv").config();
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

// ---------------------------------------------------------------------------
// Component composition — REAL Robinhood Chain TESTNET Stock Token addresses.
//
// Source of truth: the official testnet faucet contract
//   0x8762F93772c663c6a88Ba50900bd5381df2717Be (method sendTokensAndEther)
// whose on-chain token-transfers mint exactly these ERC-20 contracts per
// claim. Cross-checked against explorer.testnet.chain.robinhood.com
// (18 decimals, ERC-20). NOTE: testnet contains many same-ticker counterfeit
// tokens ("TSLA Test Stock", "Edel TSLA", "Aave Stock TSLA"...) — a matching
// ticker alone does NOT identify a Robinhood Stock Token. Do not swap these
// addresses for lookalikes.
// ---------------------------------------------------------------------------
const COMPONENT_TOKENS = [
  "0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E", // TSLA — Tesla
  "0x5884aD2f920c162CFBbACc88C9C51AA75eC09E02", // AMZN — Amazon
  "0x3b8262A63d25f0477c4DDE23F83cfe22Cb768C93", // NFLX — Netflix
];

// Units of each component (raw, 18 decimals) per 1e18 basket shares.
// Weights: TSLA 0.4 / AMZN 0.35 / NFLX 0.25.
const UNITS_PER_SHARE = [
  hre.ethers.parseUnits("0.4", 18),
  hre.ethers.parseUnits("0.35", 18),
  hre.ethers.parseUnits("0.25", 18),
];

const COMPONENT_META = [
  { symbol: "TSLA", name: "Tesla", weight: "0.4" },
  { symbol: "AMZN", name: "Amazon", weight: "0.35" },
  { symbol: "NFLX", name: "Netflix", weight: "0.25" },
];

const BASKET_NAME = "Builder Trio Index";
const BASKET_SYMBOL = "BTRIO";

function fail(msg) {
  console.error(`FATAL: ${msg}`);
  process.exit(1);
}

function isAddress(a) {
  return typeof a === "string" && /^0x[a-fA-F0-9]{40}$/.test(a);
}

function isPk(k) {
  return typeof k === "string" && /^0x[a-fA-F0-9]{64}$/.test(k);
}

async function main() {
  const { BURNWALLET_PK, MAINWALLET_ADD } = process.env;

  if (!isPk(BURNWALLET_PK || "")) {
    fail("BURNWALLET_PK missing or malformed (expected 0x + 64 hex chars). Refusing to deploy.");
  }
  if (!isAddress(MAINWALLET_ADD || "")) {
    fail("MAINWALLET_ADD missing or malformed (expected 0x + 40 hex chars). Refusing to deploy — ownership must end with the main wallet.");
  }

  const [deployer] = await hre.ethers.getSigners();
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  const net = await hre.ethers.provider.getNetwork();
  console.log(`DEPLOYER=${deployer.address}`);
  console.log(`DEPLOYER_BALANCE_WEI=${balance}`);
  console.log(`CHAIN_ID=${net.chainId}`);
  if (Number(net.chainId) !== 46630) fail(`Wrong network: expected 46630, got ${net.chainId}`);
  if (balance < hre.ethers.parseEther("0.001")) {
    fail(`Burner wallet has ${hre.ethers.formatEther(balance)} ETH — too low for gas. Fund it from https://faucet.testnet.chain.robinhood.com first.`);
  }

  // --- 1. Deploy -----------------------------------------------------------
  const Basket = await hre.ethers.getContractFactory("IndexBasket");
  const basket = await Basket.deploy(BASKET_NAME, BASKET_SYMBOL);
  await basket.waitForDeployment();
  const address = await basket.getAddress();
  const deployTx = basket.deploymentTransaction();
  const deployReceipt = await deployTx.wait();
  console.log(`BASKET_ADDRESS=${address}`);
  console.log(`DEPLOY_TX_HASH=${deployTx.hash}`);
  console.log(`DEPLOY_BLOCK=${deployReceipt.blockNumber}`);

  // --- 2. setComponents (MUST precede transferOwnership) -------------------
  // setComponents is one-time and owner-gated. Transferring ownership first
  // would make the basket permanently uninitializable, so composition is
  // set here, before the ownership handover.
  const setTx = await basket.setComponents(COMPONENT_TOKENS, UNITS_PER_SHARE);
  const setReceipt = await setTx.wait();
  console.log(`SETCOMPONENTS_TX_HASH=${setReceipt.hash}`);

  // --- 3. transferOwnership to main wallet ---------------------------------
  const ownTx = await basket.transferOwnership(MAINWALLET_ADD);
  const ownReceipt = await ownTx.wait();
  console.log(`OWNERSHIP_TX_HASH=${ownReceipt.hash}`);

  // --- 4. Confirm owner on-chain -------------------------------------------
  const finalOwner = await basket.owner();
  if (finalOwner.toLowerCase() !== MAINWALLET_ADD.toLowerCase()) {
    fail(`Ownership transfer did not land: owner()=${finalOwner}, expected ${MAINWALLET_ADD}`);
  }
  console.log(`FINAL_OWNER=${finalOwner}`);

  // Sanity: composition readable post-handover
  const compLen = await basket.componentsLength();
  console.log(`COMPONENTS_LENGTH=${compLen}`);

  // --- 5. Record deployment (real values only, written by this run) --------
  const dir = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "address.txt"), `${address}\n`);
  const record = {
    network: "robinhoodTestnet",
    chainId: 46630,
    contractAddress: address,
    name: BASKET_NAME,
    symbol: BASKET_SYMBOL,
    deployer: deployer.address,
    deployTxHash: deployTx.hash,
    deployBlock: deployReceipt.blockNumber,
    setComponentsTxHash: setReceipt.hash,
    transferOwnershipTxHash: ownReceipt.hash,
    finalOwner: finalOwner,
    components: COMPONENT_META.map((m, i) => ({
      ...m,
      address: COMPONENT_TOKENS[i],
      unitsPerShare: UNITS_PER_SHARE[i].toString(),
    })),
    verified: false,
    timestamp: new Date().toISOString(),
  };
  fs.writeFileSync(
    path.join(dir, "testnet.json"),
    JSON.stringify(record, null, 2) + "\n"
  );
  console.log("WROTE deployments/testnet.json");
  console.log(`EXPLORER_ADDRESS_URL=https://explorer.testnet.chain.robinhood.com/address/${address}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
