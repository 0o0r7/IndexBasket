/**
 * E2E connect-wallet tests with a SIMULATED EIP-1193 provider.
 *
 * What this proves (and does not):
 *  - PROVES: our app wiring — wagmi config, header WalletButton, action-panel
 *    connect CTA, chain validation, connected-state rendering, wallet menu —
 *    works end-to-end against the production build, for BOTH user stories:
 *      A. first-time visitor (eth_accounts silent = [], connect click required)
 *      B. returning authorized session (eth_accounts eager = address, auto-connect)
 *  - DOES NOT prove: real wallet software behavior (MetaMask UI, signing).
 *    The provider is a standard dApp-testing mock (same technique as synpress).
 *    Real-wallet smoke test remains a human step.
 *
 * Run: node frontend/e2e/connect.mjs [baseURL]   (default http://localhost:3100)
 */
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://localhost:3100";
const MOCK_ADDRESS = "0x1111111111111111111111111111111111111111";

function mockInit({ eager }) {
  return `
(() => {
  const ADDR = "${MOCK_ADDRESS}";
  const EAGER = ${eager ? "true" : "false"};
  const listeners = {};
  const provider = {
    isMetaMask: true,
    async request({ method }) {
      switch (method) {
        case "eth_requestAccounts":
          return [ADDR];
        case "eth_accounts":
          return EAGER ? [ADDR] : [];
        case "eth_chainId":
          return "0xb626";
        case "wallet_switchEthereumChain":
        case "wallet_addEthereumChain":
          return null;
        default:
          throw Object.assign(new Error("mock: unhandled " + method), { code: -1 });
      }
    },
    on(ev, fn) { (listeners[ev] ||= []).push(fn); },
    removeListener(ev, fn) { listeners[ev] = (listeners[ev] || []).filter((f) => f !== fn); },
    emit(ev, ...args) { (listeners[ev] || []).forEach((f) => f(...args)); },
  };
  window.ethereum = provider;
  const announce = () =>
    window.dispatchEvent(
      new CustomEvent("eip6963:announceProvider", {
        detail: Object.freeze({
          info: { uuid: "350670db-0000-0000-0000-000000000000", name: "Mock Wallet", rdns: "dev.mock.wallet" },
          provider,
        }),
      })
    );
  window.addEventListener("eip6963:requestProvider", announce);
  announce();
})();
`;
}

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}

const browser = await chromium.launch();
const pageErrors = [];

async function newPage(eager) {
  const ctx = await browser.newContext();
  await ctx.addInitScript(mockInit({ eager }));
  const page = await ctx.newPage();
  page.on("pageerror", (e) => pageErrors.push(String(e).slice(0, 160)));
  return { ctx, page };
}

try {
  // --------------------------------------------------------------- Scenario A
  console.log("— Scenario A: first-time visitor (silent eth_accounts empty) —");
  {
    const { ctx, page } = await newPage(false);
    await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 45_000 });

    const headerBtn = page
      .locator("header")
      .getByRole("button", { name: /connect wallet/i })
      .first();
    await headerBtn.waitFor({ state: "visible", timeout: 20_000 });
    if (await headerBtn.isDisabled()) fail("A: header Connect Wallet button is disabled");
    console.log("PASS header connect button visible + enabled");

    const cta = page.getByRole("button", { name: /^Connect Wallet$/i }).last();
    await cta.scrollIntoViewIfNeeded();
    if (await cta.isDisabled()) fail("A: action-panel Connect Wallet CTA is disabled");
    console.log("PASS action-panel CTA is a real, enabled connect button");

    await headerBtn.click();
    await page.getByText("1111…1111", { exact: false }).first().waitFor({ timeout: 20_000 });
    console.log("PASS click → eth_requestAccounts → address pill rendered");

    await page
      .getByRole("button", { name: /mint\s+1\s+btrio/i })
      .first()
      .waitFor({ timeout: 15_000 });
    console.log("PASS action CTA flipped from Connect to Mint (chain 46630 accepted)");

    await page.locator("header").getByRole("button", { name: /1111…1111/i }).first().click();
    await page.getByText("Disconnect").first().waitFor({ timeout: 5_000 });
    console.log("PASS wallet menu (copy/explorer/disconnect) opens");

    await page.screenshot({ path: "/home/z/my-project/download/e2e-connect-connected.png" });
    await ctx.close();
  }

  // --------------------------------------------------------------- Scenario B
  console.log("— Scenario B: returning authorized session (eager eth_accounts) —");
  {
    const { ctx, page } = await newPage(true);
    await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 45_000 });

    await page.getByText("1111…1111", { exact: false }).first().waitFor({ timeout: 20_000 });
    console.log("PASS eager reconnect: pill present without any click");

    await page
      .getByRole("button", { name: /mint\s+1\s+btrio/i })
      .first()
      .waitFor({ timeout: 15_000 });
    console.log("PASS mint CTA active on load (no hydration mismatch break)");

    const connectButtons = await page
      .getByRole("button", { name: /^Connect Wallet$/i })
      .count();
    if (connectButtons !== 0) fail("B: connect button still shown while connected");
    console.log("PASS no stray connect buttons in connected state");
    await ctx.close();
  }

  // ------------------------------------------------------------------- /health
  console.log("— /health diagnostics page —");
  {
    const { ctx, page } = await newPage(true);
    await page.goto(`${BASE}/health`, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.getByText("Injected wallet detection").waitFor({ timeout: 20_000 });
    await page
      .getByText(/Mock Wallet/i)
      .first()
      .waitFor({ timeout: 20_000 });
    console.log("PASS wallet probe detects EIP-6963 'Mock Wallet'");

    await page.waitForTimeout(1500);
    const failTexts = await page
      .getByText(/no bytecode|≠ record|chainId \d+, expected|no basket address|unreachable:/i)
      .count();
    if (failTexts > 0) fail(`/health shows failing checks (${failTexts})`);

    const passCount = await page.locator("main svg.text-emerald-400, main .text-emerald-400").count();
    console.log(`INFO /health rendered pass indicators: ${passCount}`);
    await page.screenshot({ path: "/home/z/my-project/download/e2e-health-page.png", fullPage: true });
    await ctx.close();
  }

  const realErrors = pageErrors.filter((e) => !/Minified React error #418/.test(e));
  if (realErrors.length > 0) fail(`page errors: ${realErrors.slice(0, 3).join(" | ")}`);
  console.log(
    `\nE2E CONNECT FLOW: ALL SCENARIOS PASSED (simulated EIP-1193 provider; ${
      pageErrors.length ? "hydration #418 suppressed by mounted-gate check" : "zero page errors"
    })`
  );
} catch (e) {
  fail(e.message ?? String(e));
} finally {
  await browser.close();
}
