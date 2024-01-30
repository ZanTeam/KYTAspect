// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.19;

import {IERC677} from "./interface/IERC677.sol";
import {IERC677Receiver} from "./interface/IERC677Receiver.sol";

import {Address} from "./utils/Address.sol";
import {ERC20} from "./ERC20.sol";

contract KytToken is IERC677, ERC20 {
  using Address for address;
  address public owner;
  address[] private _supportTokens;
  mapping(address => address) private _tokenOralceAddress; // 支持的token name和地址的映射

  constructor(string memory name, string memory symbol) ERC20(name, symbol) {
    owner = msg.sender;
  }

  modifier onlyOwner() {
    require(msg.sender == owner);
    _;
  }

  /// @inheritdoc IERC677
  function transferAndCall(address to, uint amount, bytes memory data) public returns (bool success) {
    super.transfer(to, amount);
    emit Transfer(msg.sender, to, amount, data);
    if (to.isContract()) {
      IERC677Receiver(to).onTokenTransfer(msg.sender, amount, data);
    }
    return true;
  }

  /// @inheritdoc IERC677
  function transferAndCall(address to, uint256 amount) external returns (bool) {
    return transferAndCall(to, amount, "");
  }

  function updateOracleAddress(address tokenAddress, address oracle) onlyOwner() public {
    _supportTokens.push(tokenAddress);
    _tokenOralceAddress[tokenAddress] = oracle;
  }

  // TODO: 调用预言机获取token最新价格
  function priceOracleAnswer(address tokenAddress) onlyOwner() public view returns (uint256 priceAnswer) {
    // address oracle = _tokenOralceAddress[tokenAddress];
    require(tokenAddress != address(0));
    return 1000;
  }

  function getOwner() public view returns (address) {
    return owner;
  }

  function getSupportTokenList() public view returns (address[] memory) {
    return _supportTokens;
  }

}