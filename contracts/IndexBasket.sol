// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
// PHASE 1 BUILD FIX (documented): original import was
// "@openzeppelin/contracts/security/ReentrancyGuard.sol" — the OpenZeppelin
// v4 path. The rest of the contract uses the OpenZeppelin v5 API
// (`Ownable(msg.sender)` constructor argument), and in v5 ReentrancyGuard
// moved to utils/. With OZ v5 the security/ path does not exist and the
// contract did not compile. Only the import path changed; no logic touched.
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title IndexBasket
/// @notice Testnet-only index basket over real Robinhood Chain faucet Stock
///         Tokens (e.g. RH-TSLA, RH-AMZN, RH-NFLX). Holders deposit the exact
///         weighted amount of each component token and receive basket shares;
///         redeeming burns shares and returns the components 1:1 with the
///         recorded weights. No price feed is read anywhere in this contract
///         — composition, not pricing, is the on-chain guarantee. This keeps
///         the contract's claims fully verifiable against its own state,
///         with no dependency on mainnet-only Chainlink Stock Token feeds.
/// @dev Deploy fresh per network; component addresses are testnet faucet
///      Stock Token addresses and must be re-verified before any mainnet use.
contract IndexBasket is ERC20, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct Component {
        IERC20 token;      // component ERC-20 (e.g. RH-TSLA)
        uint256 unitsPerShare; // amount of this component (in its own decimals) per 1e18 basket shares
    }

    Component[] public components;
    bool public initialized;

    event ComponentsSet(address[] tokens, uint256[] unitsPerShare);
    event Minted(address indexed user, uint256 shares, uint256[] amountsIn);
    event Redeemed(address indexed user, uint256 shares, uint256[] amountsOut);

    error AlreadyInitialized();
    error NotInitialized();
    error LengthMismatch();
    error ZeroShares();
    error EmptyComponents();

    constructor(string memory name_, string memory symbol_)
        ERC20(name_, symbol_)
        Ownable(msg.sender)
    {}

    /// @notice One-time setup of the basket's fixed composition. Must be
    ///         called once by the owner before any mint can occur.
    /// @param tokens Component token addresses (testnet faucet Stock Tokens).
    /// @param unitsPerShare Amount of each token (raw units, respecting that
    ///        token's own decimals) required per 1e18 (i.e. "1.0") basket shares.
    function setComponents(address[] calldata tokens, uint256[] calldata unitsPerShare)
        external
        onlyOwner
    {
        if (initialized) revert AlreadyInitialized();
        if (tokens.length == 0) revert EmptyComponents();
        if (tokens.length != unitsPerShare.length) revert LengthMismatch();

        for (uint256 i = 0; i < tokens.length; i++) {
            components.push(Component({
                token: IERC20(tokens[i]),
                unitsPerShare: unitsPerShare[i]
            }));
        }
        initialized = true;
        emit ComponentsSet(tokens, unitsPerShare);
    }

    /// @notice Deposit the exact weighted amount of every component to mint
    ///         `sharesOut` basket shares. Caller must have approved this
    ///         contract for each component token beforehand.
    function mint(uint256 sharesOut) external nonReentrant {
        if (!initialized) revert NotInitialized();
        if (sharesOut == 0) revert ZeroShares();

        uint256 len = components.length;
        uint256[] memory amountsIn = new uint256[](len);

        for (uint256 i = 0; i < len; i++) {
            Component storage c = components[i];
            // amount = ceil(unitsPerShare * sharesOut / 1e18) — round in the
            // protocol's favor so the basket is never under-collateralized.
            uint256 amount = _mulDivCeil(c.unitsPerShare, sharesOut, 1e18);
            amountsIn[i] = amount;
            c.token.safeTransferFrom(msg.sender, address(this), amount);
        }

        _mint(msg.sender, sharesOut);
        emit Minted(msg.sender, sharesOut, amountsIn);
    }

    /// @notice Burn `sharesIn` basket shares and receive back the underlying
    ///         weighted component amounts.
    function redeem(uint256 sharesIn) external nonReentrant {
        if (!initialized) revert NotInitialized();
        if (sharesIn == 0) revert ZeroShares();

        uint256 len = components.length;
        uint256[] memory amountsOut = new uint256[](len);

        _burn(msg.sender, sharesIn);

        for (uint256 i = 0; i < len; i++) {
            Component storage c = components[i];
            // amount = floor(unitsPerShare * sharesIn / 1e18) — round in the
            // protocol's favor on the way out too.
            uint256 amount = (c.unitsPerShare * sharesIn) / 1e18;
            amountsOut[i] = amount;
            c.token.safeTransfer(msg.sender, amount);
        }

        emit Redeemed(msg.sender, sharesIn, amountsOut);
    }

    /// @notice Number of components in the basket.
    function componentsLength() external view returns (uint256) {
        return components.length;
    }

    /// @notice Amount of each component currently held by the contract.
    function componentBalances() external view returns (uint256[] memory balances) {
        uint256 len = components.length;
        balances = new uint256[](len);
        for (uint256 i = 0; i < len; i++) {
            balances[i] = components[i].token.balanceOf(address(this));
        }
    }

    function _mulDivCeil(uint256 a, uint256 b, uint256 denominator) private pure returns (uint256) {
        uint256 product = a * b;
        return product / denominator + (product % denominator == 0 ? 0 : 1);
    }
}
