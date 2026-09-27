import { expect } from "chai";
import { network } from "hardhat";

// Hardhat 3: the connection (and its ethers instance) is created explicitly
// at module load; ethers v6 API is unchanged from Hardhat 2 usage.
const { ethers, networkHelpers } = await network.create();

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

// Weights: TSLA 0.4 / AMZN 0.35 / NFLX 0.25 (all 18 decimals)
const W_TSLA = ethers.parseUnits("0.4", 18); // 400000000000000000
const W_AMZN = ethers.parseUnits("0.35", 18); // 350000000000000000
const W_NFLX = ethers.parseUnits("0.25", 18); // 250000000000000000

const FUND = ethers.parseUnits("1000", 18);

async function deployTokensFixture() {
  const [owner, user1, user2] = await ethers.getSigners();

  const Mock = await ethers.getContractFactory("MockERC20");
  const tsla = await Mock.deploy("Tesla", "TSLA");
  const amzn = await Mock.deploy("Amazon", "AMZN");
  const nflx = await Mock.deploy("Netflix", "NFLX");
  await tsla.waitForDeployment();
  await amzn.waitForDeployment();
  await nflx.waitForDeployment();

  for (const t of [tsla, amzn, nflx]) {
    await t.mint(user1.address, FUND);
    await t.mint(user2.address, FUND);
  }

  return { owner, user1, user2, tsla, amzn, nflx };
}

// Initialized basket with the canonical 0.4 / 0.35 / 0.25 composition
async function deployBasketFixture() {
  const base = await deployTokensFixture();
  const Basket = await ethers.getContractFactory("IndexBasket");
  const basket = await Basket.deploy("Builder Trio Index", "BTRIO");
  await basket.waitForDeployment();

  await basket.setComponents(
    [base.tsla.target, base.amzn.target, base.nflx.target],
    [W_TSLA, W_AMZN, W_NFLX]
  );

  return { ...base, basket };
}

// Fresh basket with composition NOT yet set
async function deployUninitializedFixture() {
  const base = await deployTokensFixture();
  const Basket = await ethers.getContractFactory("IndexBasket");
  const basket = await Basket.deploy("Builder Trio Index", "BTRIO");
  await basket.waitForDeployment();
  return { ...base, basket };
}

// Single-component basket whose only component is the malicious ReentrantToken
async function deployReentrantFixture() {
  const [owner, user1] = await ethers.getSigners();
  const RNT = await ethers.getContractFactory("ReentrantToken");
  const rnt = await RNT.deploy();
  await rnt.waitForDeployment();
  await rnt.mint(user1.address, FUND);

  const Basket = await ethers.getContractFactory("IndexBasket");
  const basket = await Basket.deploy("Reentrancy Probe", "RPROBE");
  await basket.waitForDeployment();

  await basket.setComponents([rnt.target], [ethers.parseUnits("1", 18)]);
  await rnt.setBasket(basket.target);

  return { owner, user1, basket, rnt };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("IndexBasket", function () {
  describe("Deployment", function () {
    it("sets ERC20 name, symbol and 18 decimals", async function () {
      const { basket } = await networkHelpers.loadFixture(deployBasketFixture);
      expect(await basket.name()).to.equal("Builder Trio Index");
      expect(await basket.symbol()).to.equal("BTRIO");
      expect(await basket.decimals()).to.equal(18n);
    });

    it("starts uninitialized with zero supply and zero components", async function () {
      const { basket } = await networkHelpers.loadFixture(deployUninitializedFixture);
      expect(await basket.initialized()).to.equal(false);
      expect(await basket.componentsLength()).to.equal(0n);
      expect(await basket.totalSupply()).to.equal(0n);
    });

    it("sets deployer as owner", async function () {
      const { basket, owner } = await networkHelpers.loadFixture(deployBasketFixture);
      expect(await basket.owner()).to.equal(owner.address);
    });
  });

  describe("setComponents", function () {
    it("stores composition and emits ComponentsSet", async function () {
      const { basket, tsla, amzn, nflx } = await networkHelpers.loadFixture(deployUninitializedFixture);
      const tokens = [tsla.target, amzn.target, nflx.target];
      const units = [W_TSLA, W_AMZN, W_NFLX];

      await expect(basket.setComponents(tokens, units))
        .to.emit(basket, "ComponentsSet")
        .withArgs(tokens, units);

      expect(await basket.initialized()).to.equal(true);
      expect(await basket.componentsLength()).to.equal(3n);

      const c0 = await basket.components(0);
      const c1 = await basket.components(1);
      const c2 = await basket.components(2);
      expect(c0[0]).to.equal(tsla.target);
      expect(c0[1]).to.equal(W_TSLA);
      expect(c1[0]).to.equal(amzn.target);
      expect(c1[1]).to.equal(W_AMZN);
      expect(c2[0]).to.equal(nflx.target);
      expect(c2[1]).to.equal(W_NFLX);
    });

    it("reverts on second call (AlreadyInitialized)", async function () {
      const { basket } = await networkHelpers.loadFixture(deployUninitializedFixture);
      await basket.setComponents([ethers.ZeroAddress], [1n]);
      await expect(basket.setComponents([ethers.ZeroAddress], [1n]))
        .to.be.revertedWithCustomError(basket, "AlreadyInitialized");
    });

    it("reverts on length mismatch (LengthMismatch)", async function () {
      const { basket, tsla, amzn } = await networkHelpers.loadFixture(deployUninitializedFixture);
      await expect(
        basket.setComponents([tsla.target, amzn.target], [W_TSLA])
      ).to.be.revertedWithCustomError(basket, "LengthMismatch");
    });

    it("reverts on empty arrays (EmptyComponents)", async function () {
      const { basket } = await networkHelpers.loadFixture(deployUninitializedFixture);
      await expect(basket.setComponents([], []))
        .to.be.revertedWithCustomError(basket, "EmptyComponents");
    });

    it("reverts when called by non-owner", async function () {
      const { basket, user1, tsla } = await networkHelpers.loadFixture(deployUninitializedFixture);
      await expect(
        basket.connect(user1).setComponents([tsla.target], [W_TSLA])
      ).to.be.revertedWithCustomError(basket, "OwnableUnauthorizedAccount").withArgs(user1.address);
    });
  });

  describe("mint", function () {
    it("pulls exact weighted amounts in, mints shares, emits Minted", async function () {
      const { basket, user1, tsla, amzn, nflx } = await networkHelpers.loadFixture(deployBasketFixture);
      const shares = ethers.parseUnits("1", 18);

      for (const t of [tsla, amzn, nflx]) {
        await t.connect(user1).approve(basket.target, ethers.MaxUint256);
      }

      await expect(basket.connect(user1).mint(shares))
        .to.emit(basket, "Minted")
        .withArgs(user1.address, shares, [W_TSLA, W_AMZN, W_NFLX]);

      // shares minted 1:1
      expect(await basket.balanceOf(user1.address)).to.equal(shares);
      expect(await basket.totalSupply()).to.equal(shares);

      // user paid exactly 0.4 / 0.35 / 0.25 of each token
      expect(await tsla.balanceOf(user1.address)).to.equal(FUND - W_TSLA);
      expect(await amzn.balanceOf(user1.address)).to.equal(FUND - W_AMZN);
      expect(await nflx.balanceOf(user1.address)).to.equal(FUND - W_NFLX);

      // basket holds them
      expect(await tsla.balanceOf(basket.target)).to.equal(W_TSLA);
      expect(await amzn.balanceOf(basket.target)).to.equal(W_AMZN);
      expect(await nflx.balanceOf(basket.target)).to.equal(W_NFLX);
    });

    it("rounds component amounts UP on the way in (protocol keeps the dust)", async function () {
      const { basket, user1, tsla, amzn, nflx } = await networkHelpers.loadFixture(deployBasketFixture);
      // 0.500000000000000001 shares — deliberately not divisible by the weights
      const oddShares = ethers.parseUnits("0.5", 18) + 1n;

      for (const t of [tsla, amzn, nflx]) {
        await t.connect(user1).approve(basket.target, ethers.MaxUint256);
      }

      // Expected ceil values, hardcoded literals computed by hand:
      // TSLA: ceil(0.4 * 0.500000000000000001) = 0.200000000000000001
      // AMZN: ceil(0.35 * 0.500000000000000001) = 0.175000000000000001
      // NFLX: ceil(0.25 * 0.500000000000000001) = 0.125000000000000001
      await expect(basket.connect(user1).mint(oddShares))
        .to.emit(basket, "Minted")
        .withArgs(user1.address, oddShares, [
          200000000000000001n,
          175000000000000001n,
          125000000000000001n,
        ]);

      expect(await tsla.balanceOf(user1.address)).to.equal(FUND - 200000000000000001n);
      expect(await amzn.balanceOf(user1.address)).to.equal(FUND - 175000000000000001n);
      expect(await nflx.balanceOf(user1.address)).to.equal(FUND - 125000000000000001n);
    });

    it("accumulates across multiple mints and multiple users", async function () {
      const { basket, user1, user2, tsla, amzn, nflx } = await networkHelpers.loadFixture(deployBasketFixture);
      for (const t of [tsla, amzn, nflx]) {
        await t.connect(user1).approve(basket.target, ethers.MaxUint256);
        await t.connect(user2).approve(basket.target, ethers.MaxUint256);
      }

      await basket.connect(user1).mint(ethers.parseUnits("2", 18));
      await basket.connect(user2).mint(ethers.parseUnits("3", 18));

      expect(await basket.balanceOf(user1.address)).to.equal(ethers.parseUnits("2", 18));
      expect(await basket.balanceOf(user2.address)).to.equal(ethers.parseUnits("3", 18));
      expect(await basket.totalSupply()).to.equal(ethers.parseUnits("5", 18));

      // basket collateral: 5 shares * weights
      expect(await tsla.balanceOf(basket.target)).to.equal(ethers.parseUnits("2", 18));
      expect(await amzn.balanceOf(basket.target)).to.equal(ethers.parseUnits("1.75", 18));
      expect(await nflx.balanceOf(basket.target)).to.equal(ethers.parseUnits("1.25", 18));

      const balances = await basket.componentBalances();
      expect(balances[0]).to.equal(ethers.parseUnits("2", 18));
      expect(balances[1]).to.equal(ethers.parseUnits("1.75", 18));
      expect(balances[2]).to.equal(ethers.parseUnits("1.25", 18));
    });

    it("reverts on mint of zero shares (ZeroShares)", async function () {
      const { basket, user1 } = await networkHelpers.loadFixture(deployBasketFixture);
      await expect(basket.connect(user1).mint(0n))
        .to.be.revertedWithCustomError(basket, "ZeroShares");
    });

    it("reverts when called before setComponents (NotInitialized)", async function () {
      const { basket, user1 } = await networkHelpers.loadFixture(deployUninitializedFixture);
      await expect(basket.connect(user1).mint(1n))
        .to.be.revertedWithCustomError(basket, "NotInitialized");
    });

    it("reverts on insufficient allowance", async function () {
      const { basket, user1, tsla } = await networkHelpers.loadFixture(deployBasketFixture);
      // no approval at all -> allowance 0
      await expect(basket.connect(user1).mint(ethers.parseUnits("1", 18)))
        .to.be.revertedWithCustomError(tsla, "ERC20InsufficientAllowance")
        .withArgs(basket.target, 0n, W_TSLA);
    });

    it("reverts on insufficient token balance even with allowance", async function () {
      const { basket, user1, user2, tsla, amzn, nflx } = await networkHelpers.loadFixture(deployBasketFixture);
      for (const t of [tsla, amzn, nflx]) {
        await t.connect(user2).approve(basket.target, ethers.MaxUint256);
      }
      // user2 drains their NFLX so the proportional pull fails mid-loop.
      // The mint loop pulls TSLA first, then AMZN, then NFLX — so the call
      // must revert when it reaches the NFLX transferFrom with 0 balance.
      const bal = await nflx.balanceOf(user2.address);
      await nflx.connect(user2).transfer(user1.address, bal);

      await expect(basket.connect(user2).mint(ethers.parseUnits("1", 18)))
        .to.be.revertedWithCustomError(nflx, "ERC20InsufficientBalance")
        .withArgs(user2.address, 0n, W_NFLX);
    });
  });

  describe("redeem", function () {
    it("burns shares and returns exact weighted amounts, emits Redeemed", async function () {
      const { basket, user1, tsla, amzn, nflx } = await networkHelpers.loadFixture(deployBasketFixture);
      const shares = ethers.parseUnits("1", 18);
      for (const t of [tsla, amzn, nflx]) {
        await t.connect(user1).approve(basket.target, ethers.MaxUint256);
      }
      await basket.connect(user1).mint(shares);

      await expect(basket.connect(user1).redeem(shares))
        .to.emit(basket, "Redeemed")
        .withArgs(user1.address, shares, [W_TSLA, W_AMZN, W_NFLX]);

      expect(await basket.balanceOf(user1.address)).to.equal(0n);
      expect(await basket.totalSupply()).to.equal(0n);

      // full round trip returns exactly what was paid in
      expect(await tsla.balanceOf(user1.address)).to.equal(FUND);
      expect(await amzn.balanceOf(user1.address)).to.equal(FUND);
      expect(await nflx.balanceOf(user1.address)).to.equal(FUND);
      expect(await tsla.balanceOf(basket.target)).to.equal(0n);
      expect(await amzn.balanceOf(basket.target)).to.equal(0n);
      expect(await nflx.balanceOf(basket.target)).to.equal(0n);
    });

    it("rounds component amounts DOWN on the way out (protocol keeps the dust)", async function () {
      const { basket, user1, tsla, amzn, nflx } = await networkHelpers.loadFixture(deployBasketFixture);
      const oddShares = ethers.parseUnits("0.5", 18) + 1n;
      for (const t of [tsla, amzn, nflx]) {
        await t.connect(user1).approve(basket.target, ethers.MaxUint256);
      }
      await basket.connect(user1).mint(oddShares);

      // floor values: one wei less than what mint pulled in
      await expect(basket.connect(user1).redeem(oddShares))
        .to.emit(basket, "Redeemed")
        .withArgs(user1.address, oddShares, [
          200000000000000000n,
          175000000000000000n,
          125000000000000000n,
        ]);

      // the 1-wei rounding dust stays in the basket — never under-collateralized
      expect(await tsla.balanceOf(basket.target)).to.equal(1n);
      expect(await amzn.balanceOf(basket.target)).to.equal(1n);
      expect(await nflx.balanceOf(basket.target)).to.equal(1n);
      expect(await basket.totalSupply()).to.equal(0n);
    });

    it("redeems proportionally across users (share of collateral is respected)", async function () {
      const { basket, user1, user2, tsla, amzn, nflx } = await networkHelpers.loadFixture(deployBasketFixture);
      for (const t of [tsla, amzn, nflx]) {
        await t.connect(user1).approve(basket.target, ethers.MaxUint256);
        await t.connect(user2).approve(basket.target, ethers.MaxUint256);
      }
      await basket.connect(user1).mint(ethers.parseUnits("2", 18));
      await basket.connect(user2).mint(ethers.parseUnits("3", 18));

      // snapshot user2's position after their mint (they are not part of this
      // redeem, so their balances must not move — this checks the redeem pulls
      // only from collateral, never from other users' component balances)
      const u2Tsla = await tsla.balanceOf(user2.address);
      const u2Amzn = await amzn.balanceOf(user2.address);
      const u2Nflx = await nflx.balanceOf(user2.address);

      // user1 redeems 1 of their 2 shares
      await basket.connect(user1).redeem(ethers.parseUnits("1", 18));

      expect(await basket.balanceOf(user1.address)).to.equal(ethers.parseUnits("1", 18));
      // user1 paid for 2 shares, got 1 share's worth back:
      // net cost = 1 share * weights
      expect(await tsla.balanceOf(user1.address)).to.equal(FUND - W_TSLA);
      expect(await amzn.balanceOf(user1.address)).to.equal(FUND - W_AMZN);
      expect(await nflx.balanceOf(user1.address)).to.equal(FUND - W_NFLX);
      // user2's balances exactly as they were after their own mint
      expect(await tsla.balanceOf(user2.address)).to.equal(u2Tsla);
      expect(await amzn.balanceOf(user2.address)).to.equal(u2Amzn);
      expect(await nflx.balanceOf(user2.address)).to.equal(u2Nflx);
    });

    it("reverts on redeem of zero shares (ZeroShares)", async function () {
      const { basket, user1 } = await networkHelpers.loadFixture(deployBasketFixture);
      await expect(basket.connect(user1).redeem(0n))
        .to.be.revertedWithCustomError(basket, "ZeroShares");
    });

    it("reverts when redeeming before initialization (NotInitialized)", async function () {
      const { basket, user1 } = await networkHelpers.loadFixture(deployUninitializedFixture);
      await expect(basket.connect(user1).redeem(1n))
        .to.be.revertedWithCustomError(basket, "NotInitialized");
    });

    it("reverts when burning more shares than owned (ERC20InsufficientBalance)", async function () {
      const { basket, user1 } = await networkHelpers.loadFixture(deployBasketFixture);
      await expect(
        basket.connect(user1).redeem(ethers.parseUnits("1", 18))
      ).to.be.revertedWithCustomError(basket, "ERC20InsufficientBalance")
       .withArgs(user1.address, 0n, ethers.parseUnits("1", 18));
    });
  });

  describe("Reentrancy", function () {
    it("benign single-component mint works (proves the revert below comes from the reentry, not the token)", async function () {
      const { basket, rnt, user1 } = await networkHelpers.loadFixture(deployReentrantFixture);
      await rnt.connect(user1).approve(basket.target, ethers.MaxUint256);
      await basket.connect(user1).mint(ethers.parseUnits("2", 18));
      expect(await basket.balanceOf(user1.address)).to.equal(ethers.parseUnits("2", 18));
      expect(await rnt.balanceOf(basket.target)).to.equal(ethers.parseUnits("2", 18));
    });

    it("reentrant mint via transferFrom is blocked (ReentrancyGuardReentrantCall), state intact", async function () {
      const { basket, rnt, user1 } = await networkHelpers.loadFixture(deployReentrantFixture);
      // establish a clean baseline position first
      await rnt.connect(user1).approve(basket.target, ethers.MaxUint256);
      await basket.connect(user1).mint(ethers.parseUnits("2", 18));
      const sharesBefore = await basket.balanceOf(user1.address);
      const basketBalBefore = await rnt.balanceOf(basket.target);

      // arm the trap: transferFrom will reenter mint()
      await rnt.connect(user1).setAttack(1);
      await expect(
        basket.connect(user1).mint(ethers.parseUnits("1", 18))
      ).to.be.revertedWithCustomError(basket, "ReentrancyGuardReentrantCall");

      // nothing moved
      expect(await basket.balanceOf(user1.address)).to.equal(sharesBefore);
      expect(await rnt.balanceOf(basket.target)).to.equal(basketBalBefore);
      expect(await rnt.balanceOf(user1.address)).to.equal(FUND - ethers.parseUnits("2", 18));
    });

    it("reentrant redeem via transfer is blocked (ReentrancyGuardReentrantCall), state intact", async function () {
      const { basket, rnt, user1 } = await networkHelpers.loadFixture(deployReentrantFixture);
      await rnt.connect(user1).approve(basket.target, ethers.MaxUint256);
      await basket.connect(user1).mint(ethers.parseUnits("2", 18));
      const sharesBefore = await basket.balanceOf(user1.address);
      const basketBalBefore = await rnt.balanceOf(basket.target);

      // arm the trap: transfer will reenter redeem()
      await rnt.connect(user1).setAttack(2);
      await expect(
        basket.connect(user1).redeem(ethers.parseUnits("1", 18))
      ).to.be.revertedWithCustomError(basket, "ReentrancyGuardReentrantCall");

      // nothing moved — the burn was rolled back with the reversion
      expect(await basket.balanceOf(user1.address)).to.equal(sharesBefore);
      expect(await rnt.balanceOf(basket.target)).to.equal(basketBalBefore);
      expect(await rnt.balanceOf(user1.address)).to.equal(FUND - ethers.parseUnits("2", 18));
    });
  });

  describe("Basket share token", function () {
    it("shares are transferable like any ERC-20", async function () {
      const { basket, user1, user2, tsla, amzn, nflx } = await networkHelpers.loadFixture(deployBasketFixture);
      for (const t of [tsla, amzn, nflx]) {
        await t.connect(user1).approve(basket.target, ethers.MaxUint256);
      }
      await basket.connect(user1).mint(ethers.parseUnits("1", 18));
      await basket.connect(user1).transfer(user2.address, ethers.parseUnits("0.5", 18));
      expect(await basket.balanceOf(user2.address)).to.equal(ethers.parseUnits("0.5", 18));
      expect(await basket.balanceOf(user1.address)).to.equal(ethers.parseUnits("0.5", 18));
    });
  });
});
