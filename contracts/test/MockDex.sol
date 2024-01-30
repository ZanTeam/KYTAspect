// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.19;

import { IERC677Receiver } from "../interface/IERC677Receiver.sol";
import '../interface/IERC20.sol';


contract MockDex is IERC677Receiver {
    address token0;
    address token1;

    event ReceiveART(string func, address sender, uint256 value);

    constructor(address token0_, address token1_) {
        token0 = token0_;
        token1 = token1_;
    }

    function getToken0() external view returns (address){
        return token0;
    }

    function getToken1() external view returns (address){
        return token1;
    }

    function deposit() external payable {
        emit ReceiveART("deposit()", msg.sender, msg.value);
    }

    function onTokenTransfer(address sender, uint256 amount, bytes calldata data) external virtual {

        (bool success0, ) = token0.call(
            abi.encodeWithSelector(IERC20.transfer.selector, sender, amount)
        );

        (bool success1, ) = token1.call(
            abi.encodeWithSelector(IERC20.transfer.selector, sender, amount)
        );

        (bool success, /* bytes memory data */) = sender.call{value: amount}("");
        if (!success) {
            revert("native ART: ART_TRANSFER_FAILED");
        }


    }
}
