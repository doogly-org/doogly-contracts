// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {HypercertMinter} from "hypercert/contracts/src/protocol/HypercertMinter.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract HyperFund is HypercertMinter, Ownable, Safe {
    IERC20 public erc20Token;
    uint256 public tokenID;
    uint256 public typeID;
    uint256 public units;
    address[] public beneficiaries;
    uint256[] public fractions;

    event DonationReceived(address donor, uint256 amount);

    constructor(address _erc20Token) {
        erc20Token = IERC20(_erc20Token);
    }

    // ADMIN FUNCTIONS

    function startCampaign(uint256 units, string memory uri) external onlyOwner {
        // TODO check that last campaign is finished?
        mintClaim(owner(), units, uri, TransferRestrictions.AllowAll);
        typeID = typeCounter << 128;
        tokenID = typeID + maxIndex[typeID];
    }

    function setBeneficiaries(address[] memory _beneficiaries, uint256[] memory _fractions) external onlyOwner {
        require(beneficiaries.length == fractions.length, "Beneficiaries and fractions length mismatch");
        beneficiaries = _beneficiaries;
        fractions = _fractions;
    }

    // PUBLIC FUNCTIONS

    function onERC20Received(address from, uint256 amount) external {
        require(msg.sender == address(erc20Token), "Only specific ERC20 token allowed");
        _mintFraction(from, amount);
        emit DonationReceived(from, amount);
    }

    // INTERNAL FUNCTIONS

    function _mintFraction(address account, uint256 amount) internal {
        splitFraction(owner(), tokenID, [amount, tokenValues[tokenID] - amount]); // this results in tokenID now holding the new amount
        _safeTransferFrom(owner(), account, tokenID, amount, "");
        tokenID = typeID + maxIndex[typeID]; // next token now holds the rest of the amount
    }
}