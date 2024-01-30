// SPDX-License-Identifier: GPL-3.0

import {
    ConnectToANode, 
    DeployAspect, 
    DeployContract, 
    ContractCall,
    SendTx,
    BindAspect, 
    EntryPoint} from "./base-test.js";

import assert from "assert";

const contractAbiPath = "../build/contract/KytToken.abi";
const contractBinPath = "../build/contract/KytToken.bin";
const erc20AbiPath = "../build/contract/ERC20.abi";
const erc20BinPath = "../build/contract/ERC20.bin";
const mockDexAbiPath = "../build/contract/MockDex.abi";
const mockDexBinPath = "../build/contract/MockDex.bin";

const initToken0Amount = 666666; 
const initToken1Amount = 100000000; 

// kyt token
const kytTokenResult = await DeployContract({
    abiPath: contractAbiPath, 
    bytePath: contractBinPath,
    args: ["Kyt token","KYT"]
})

console.log("==deploy KytToken Contract Result== ", kytTokenResult.contractAddress)
assert.ok(kytTokenResult, "deploy KYT token fail")

// mock WART
const mockWARTResult = await DeployContract({
    abiPath: erc20AbiPath, 
    bytePath: erc20BinPath,
    args: ["Wrapped ART","WART"]
})

console.log("==deploy mock WART Contract Result== ", mockWARTResult.contractAddress)
assert.ok(mockWARTResult, "deploy WART fail")

// mock USDT
const mockUSDTResult = await DeployContract({
    abiPath: erc20AbiPath, 
    bytePath: erc20BinPath,
    args: ["Tether","USDT"]
})

console.log("==deploy mock USDT Contract Result== ", mockUSDTResult.contractAddress)
assert.ok(mockUSDTResult, "deploy USDT fail")

// mock DEX pool
const mockDexResult = await DeployContract({
    abiPath: mockDexAbiPath, 
    bytePath: mockDexBinPath,
    args: [mockWARTResult.contractAddress, mockUSDTResult.contractAddress]
})

console.log("==deploy mock Dex Pool Contract Result== ", mockDexResult.contractAddress)
assert.ok(mockDexResult, "deploy mock Dex Pool fail")

// transfer native to dex
const transferNativeART = await SendTx({
    contract: mockDexResult.contractAddress,
    abiPath: mockDexAbiPath,
    method: "deposit",
    value: initToken1Amount
});
console.log("==== Transfer ART === ", transferNativeART.transactionHash);
console.log("==== Transfer ART === ", transferNativeART.status);

// check Pool token0 & token1 address
const callToken0 = await ContractCall({
    contract: mockDexResult.contractAddress,
    abiPath: mockDexAbiPath,
    method: "getToken0"
});

const callToken1 = await ContractCall({
    contract: mockDexResult.contractAddress,
    abiPath: mockDexAbiPath,
    method: "getToken1"
});
console.log("==== Pool Token0 === " + callToken0);
console.log("==== Pool Token1 === " + callToken1);
assert.strictEqual(callToken0, mockWARTResult.contractAddress, "Contract Call result fail")
assert.strictEqual(callToken1, mockUSDTResult.contractAddress, "Contract Call result fail")

// init pool
const transferWART = await SendTx({
    contract: mockWARTResult.contractAddress,
    abiPath: erc20AbiPath,
    method: "transfer",
    args: [mockDexResult.contractAddress, initToken0Amount]
});
console.log("==== Transfer WART === ", transferWART.status);

const transferUSDT = await SendTx({
    contract: mockUSDTResult.contractAddress,
    abiPath: erc20AbiPath,
    method: "transfer",
    args: [mockDexResult.contractAddress, initToken1Amount]
});
console.log("==== Transfer WART === ", transferUSDT.status);

const getToken0Balance = await ContractCall({
    contract: mockWARTResult.contractAddress,
    abiPath: erc20AbiPath,
    method: "balanceOf",
    args: [mockDexResult.contractAddress]
});

const getToken1Balance = await ContractCall({
    contract: mockUSDTResult.contractAddress,
    abiPath: erc20AbiPath,
    method: "balanceOf",
    args: [mockDexResult.contractAddress]
});
console.log("==== Token0 Balance === " + getToken0Balance);
console.log("==== Token1 Balance === " + getToken1Balance);
assert.strictEqual(getToken0Balance, initToken0Amount.toString(), "Contract Call result fail")
assert.strictEqual(getToken1Balance, initToken1Amount.toString(), "Contract Call result fail")

// kyt aspect
const aspect = await DeployAspect({
    wasmPath: "../build/release.wasm",
    joinPoints: [
        "PreTxExecute",
        "PostTxExecute",
        "PreContractCall",
        "PostContractCall",
    ],
})

console.log("==deploy Aspect Result== ", aspect.aspectAddress)
assert.ok(aspect, "deploy Aspect fail")

const bindResult = await BindAspect({
    abiPath: "../build/contract/KytToken.abi",
    contractAddress: kytTokenResult.contractAddress,
    aspectId: aspect.aspectAddress
})
console.log("== bind Aspect Result == ", bindResult.transactionHash)

// main test
// transfer native to dex
const transferAndCall = await SendTx({
    contract: kytTokenResult.contractAddress,
    abiPath: contractAbiPath,
    method: "transferAndCall",
    args: [mockDexResult.contractAddress, initToken0Amount]
});
console.log("==== Transfer And Call Test === ", transferAndCall.transactionHash);


// for (let i = 0; i < 10; i++) {
//     const rawcall = await EntryPoint({
//         aspectId: aspect.aspectAddress,
//         operationData: '0x1167c2e50dFE34b9Ad593d2c6694731097147317'
//     })
//     const web3 = ConnectToANode();

//     const rest = web3.eth.abi.decodeParameter('string', rawcall);
//     console.log( rest)

// }