// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.19;


contract MockOracle{
    uint256 tokenPrice;

    constructor(uint256 tokenPrice_) {
        tokenPrice = tokenPrice_;
    }

    function getAnswer()  external view returns (uint256){
        return tokenPrice;
    }
}