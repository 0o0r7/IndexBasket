// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

interface IBasket {
    function mint(uint256 sharesOut) external;
    function redeem(uint256 sharesIn) external;
}

/// @notice Malicious component token that attempts to reenter the basket's
///         mint() or redeem() from inside transfer / transferFrom.
///         attackMode: 0 = benign, 1 = reenter mint, 2 = reenter redeem.
contract ReentrantToken is ERC20 {
    address public basket;
    uint8 public attackMode;

    constructor() ERC20("Reentrant", "RNT") {}

    function setBasket(address basket_) external {
        basket = basket_;
    }

    function setAttack(uint8 mode_) external {
        attackMode = mode_;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function transfer(address to, uint256 amount) public override returns (bool) {
        _maybeAttack();
        _transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        _maybeAttack();
        _transfer(from, to, amount);
        return true;
    }

    function _maybeAttack() private {
        if (attackMode == 1 && basket != address(0)) {
            attackMode = 0;
            IBasket(basket).mint(1 ether);
        } else if (attackMode == 2 && basket != address(0)) {
            attackMode = 0;
            IBasket(basket).redeem(1 ether);
        }
    }
}
