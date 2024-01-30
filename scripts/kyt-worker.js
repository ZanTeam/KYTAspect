// SPDX-License-Identifier: GPL-3.0

"use strict"

const Web3 = require('@artela/web3');
const fs = require("fs");
const BigNumber = require('bignumber.js');


// ******************************************
// init web3 and private key
// ******************************************
const configJson = JSON.parse(fs.readFileSync('./project.config.json', "utf-8").toString());
const web3 = new Web3(configJson.node);

let sk = fs.readFileSync("privateKey.txt", 'utf-8');
const account = web3.eth.accounts.privateKeyToAccount(sk.trim());
web3.eth.accounts.wallet.add(account.privateKey);

// ******************************************
// init aspect client
// ******************************************
// instantiate an instance of the contract
let aspectCore = web3.atl.aspectCore();
// instantiate an instance of aspect
let aspect = new web3.atl.Aspect();

// ******************************************
// test data
// ******************************************
let mainKey = rmPrefix(account.address);
let sKey = rmPrefix(account.address);;
let contract = "0250032b4a11478969dc4caaa11ecc2ea98cfc12";
let method1 = "0A0A0A0A";
let method2 = "0B0B0B0B";


async function f() {

    while (true){
        // await deployAspect();
        aspect.options.address = ""//TODO: Fill in the actual aspectId
        let address = await getRequest();
        console.log("get an address from the request queue:", address);
        let kytResp = "";
        const sdk = require('api')('@zan-doc/v1.0#1wh0colnts63fh');
        sdk.auth('');//TODO: Fill in the API KEY generated on the ZAN website(https://zan.top)
        sdk.postScore({
        analysisType: 'FAST',
        objectType: 'Address',
        objectId: address,
        chainShortName: 'eth',
        depth: '1'
        })
        .then(async ({ data }) => {
            console.log("get response from KYT: ", data);
            console.log("save the response to aspect...");
            await setKYTResponse(address, kytResp);
        })
        .catch(err => console.error(err));
        await sleep(500);
    }
}

function sleep(ms) {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }

async function deployAspect() {
    // load aspect code and deploy
    let aspectCode = fs.readFileSync('./build/release.wasm', {
        encoding: "hex"
    });

    let aspectDeployData = aspect.deploy({
        data: '0x' + aspectCode,
        properties: [],
        joinPoints: ["VerifyTx"],
        paymaster: account.address,
        proof: '0x0'
    }).encodeABI();

    let tx = await getOperationTx(aspectDeployData);

    console.log('signed Aspect deploy Tx');

    let signedTx = await web3.eth.accounts.signTransaction(tx, account.privateKey);

    console.log('send Aspect deploy Tx');

    let receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);
    aspect.options.address = receipt.aspectAddress;

    console.log('receipt :\n', receipt);
    console.log('aspect address is: ', aspect.options.address);
}


async function getRequest() {
    let op = "0x0006";
    let calldata = aspect.operation(op).encodeABI();
    let ret = await web3.eth.call({
        from: account.address,
        to: aspectCore.options.address, // contract address
        data: calldata
    });
    ret = web3.eth.abi.decodeParameter('string', ret);
    return ret;
}


async function setKYTResponse() {
    let op = "0x0007";
    let params = rmPrefix(contract) + rmPrefix(web3.utils.utf8ToHex("{}"));
    console.log("params, ", params);
    let calldata = aspect.operation(op + params).encodeABI();
    let ret = await web3.eth.call({
        from: account.address,
        to: aspectCore.options.address, // contract address
        data: calldata
    });
}

function rmPrefix(data) {
    if (data.startsWith('0x')) {
        return data.substring(2, data.length);
    } else {
        return data;
    }
}


async function getOperationTx(calldata) {

    let nonce = await web3.eth.getTransactionCount(account.address);
    let gasPrice = await web3.eth.getGasPrice();
    let chainId = await web3.eth.getChainId();

    let tx = {
        from: account.address,
        nonce: nonce,
        gasPrice,
        gas: 8000000,
        data: calldata,
        to: aspectCore.options.address,
        chainId
    }

    console.log('tx: \n', tx);

    return tx;
}

f().then();
