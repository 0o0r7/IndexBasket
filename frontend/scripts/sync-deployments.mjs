// Keeps a build-time snapshot of the real on-chain deployment record inside
// the frontend bundle. Address resolution order in lib/contract.ts:
//   1. NEXT_PUBLIC_BASKET_ADDRESS env (set on Vercel / .env.local)
//   2. this synced snapshot of deployments/testnet.json
import { copyFileSync, existsSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const frontend = dirname(here);
const repoRoot = join(frontend, "..");
const src = join(repoRoot, "deployments", "testnet.json");
const destDir = join(frontend, "lib");
const dest = join(destDir, "deployments.json");

if (existsSync(src)) {
  copyFileSync(src, dest);
  console.log("[sync-deployments] copied deployments/testnet.json -> lib/deployments.json");
} else if (!existsSync(dest)) {
  // Placeholder so `next build` never crashes pre-deployment; the UI shows
  // an explicit "no contract deployed on this network yet" state.
  writeFileSync(
    dest,
    JSON.stringify({ contractAddress: null, note: "not deployed yet" }, null, 2) + "\n"
  );
  console.log("[sync-deployments] no deployments/testnet.json — wrote null-address placeholder");
} else {
  console.log("[sync-deployments] source missing, keeping existing lib/deployments.json");
}
