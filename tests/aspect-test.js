// SPDX-License-Identifier: GPL-3.0

import {
    ConnectToANode, 
    DeployAspect, 
    DeployContract, 
    ContractCall,
    SendTx,
    BindAspect, 
    EntryPoint} from "./base-test.js";

const contractAbiPath = "../build/contract/KytToken.abi";
const contractBinPath = "../build/contract/KytToken.bin";
const erc20AbiPath = "../build/contract/ERC20.abi";
const erc20BinPath = "../build/contract/ERC20.bin";
const mockDexAbiPath = "../build/contract/MockDex.abi";
const mockDexBinPath = "../build/contract/MockDex.bin";

const initToken0Amount = 666666; 
const initToken1Amount = 100000000; 

const kytTokenAddress = "0x022A3435CB8AA813B81CDb4F3452DaA28bF131E4";
const mockDexAddress = "0xE806e27826f28dBb7750Cc00da6196beA47Bc463";

// transfer native to dex
const transferAndCall = await SendTx({
    contract: kytTokenAddress,
    abiPath: contractAbiPath,
    method: "transferAndCall",
    args: [mockDexAddress, initToken0Amount]
});
console.log("==== Transfer And Call Test === ", transferAndCall.transactionHash);