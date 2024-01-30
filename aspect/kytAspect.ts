// SPDX-License-Identifier: GPL-3.0

import {
    allocate,
    entryPoint,
    execute,
    PreContractCallInput,
    IPreContractCallJP,
    IPostContractCallJP,
    IPostTxExecuteJP,
    PostContractCallInput,
    PostTxExecuteInput,
    sys,
    ethereum,
    EthLogs,
    EthLog,
    BytesData,
    uint8ArrayToHex,
    CallTreeQuery,
    EthCallTree,
    EthCallMessage,
    hexToUint8Array,
    stringToUint8Array,
    uint8ArrayToAddress,
    BigInt,
    JitCallBuilder,
    IAspectOperation,
    OperationInput,
    StringArrayData,
    Any
} from "@artela/aspect-libs";

import { Protobuf } from "as-proto/assembly";

import { TokenTransfer } from "./models/tokenTransfer";
import { FlashloanCall } from "./models/flashloanCall";
import { FlashloanArbitrage } from "./models/flashloanArbitrage";
import { ERC20_TRANSFER, WETH_DEPOSIT, WETH_WITHDRAW } from './constant/logTopic0';
import { NATIVE_TOKEN_ADDRESS } from './constant/protocolAddress'

/**
 * Please describe what functionality this aspect needs to implement.
 *
 * About the concept of Aspect @see [join-point](https://docs.artela.network/develop/core-concepts/join-point)
 * How to develop an Aspect  @see [Aspect Structure](https://docs.artela.network/develop/reference/aspect-lib/aspect-structure)
 */
class KytAspect implements IPreContractCallJP, IPostContractCallJP, IPostTxExecuteJP, IAspectOperation {
    readonly kytTokenOwner: string = "0x0000000000000000000000000000000000000000";      // KytToken Owner Address
    readonly kytTokenAddress: string = "0x0000000000000000000000000000000000000000";    // KytToken Address
    readonly flashloanArbitrageThreshold: f64 = 1000;                                   // Flashloan Arbitrage Threshold 
    /**
     * isOwner is the governance account implemented by the Aspect, when any of the governance operation
     * (including upgrade, config, destroy) is made, isOwner method will be invoked to check
     * against the initiator's account to make sure it has the permission.
     *
     * @param sender address of the transaction
     * @return true if check success, false if check fail
     */
    isOwner(sender: Uint8Array): bool {
        return true;
    }

    parseOP(calldata: string): string {
        if (calldata.startsWith('0x')) {
            return calldata.substring(2, 6);
        } else {
            return calldata.substring(0, 4);
        }
    }

    parsePrams(calldata: string): string {
        if (calldata.startsWith('0x')) {
            return calldata.substring(6, calldata.length);
        } else {
            return calldata.substring(4, calldata.length);
        }
    }

    rmPrefix(data: string): string {
        if (data.startsWith('0x')) {
            return data.substring(2, data.length);
        } else {
            return data;
        }
    }

    operation(input: OperationInput): Uint8Array {
        const calldata = uint8ArrayToHex(input.callData);
        const op = this.parseOP(calldata);
        const params = this.parsePrams(calldata);
        if (op == "0006"){
            const ret = this.getRequest();
            return stringToUint8Array(ret);
        }
        else if (op == "0007"){
            this.setKYTResponse(params);
        }
        else {
            sys.log("op="+op);
            sys.revert("unknown op:"+op);
        }
        return new Uint8Array(0);
    }

    requestkytApi(address: string): void{
        let v = new StringArrayData();
        v.data.push(address);
        const uint8Array = Protobuf.encode(v, StringArrayData.encode);
        sys.aspect.mutableState.get<Uint8Array>("KYTRequestQueue").set(uint8Array);
    }

    getRequest() : string{
        //just for test
        let uint8Array: Uint8Array = sys.aspect.mutableState.get<Uint8Array>("KYTRequestQueue").unwrap();
        let stringArrayData: StringArrayData = Protobuf.decode<StringArrayData>(uint8Array, StringArrayData.decode);
        // stringArrayData.data.length
        if (stringArrayData.data.length == 0){
            return "";
        }else{
            let address = stringArrayData.data.pop();
            // sys.revert(address);
            return address;
        }
    }

    setKYTResponse(params: string): void {
        const address = params.slice(0, 40);
        const kytResp = params.slice(40);
        sys.aspect.mutableState.get<string>(address).set(kytResp);
    }

    getKYTResponse(address: string): string{
        return sys.aspect.mutableState.get<string>(address).unwrap();
    }



    preContractCall(input: PreContractCallInput): void {
        // Get the token price in advance through the oracle，for postTxExecute
        let callData = ethereum.abiEncode('getSupportTokenList',[]);
        
        let sender = hexToUint8Array(this.kytTokenOwner); 
        let request = JitCallBuilder.simple(
            sender,
            stringToUint8Array(this.kytTokenAddress),
            hexToUint8Array(callData)
        ).build();
        
        // Submit the JIT call
        let response = sys.hostApi.evmCall.jitCall(request);
            if (response.success) {
              // update token price
                let supportTokenList: string[] = this.uint8ArrayToAddressList(response.ret);
                for (let i: i32 = 0, len: i32 = supportTokenList.length; i <len ; i++) {
                    let priceCallData = ethereum.abiEncode('priceOracleAnswer', [ethereum.Address.fromHexString(supportTokenList[i])]);
    
                    let priceRequest = JitCallBuilder.simple(
                        sender,
                        stringToUint8Array(this.kytTokenAddress),
                        hexToUint8Array(priceCallData)
                    ).build();

                    let priceResponse = sys.hostApi.evmCall.jitCall(priceRequest);
                    let tokenPrice: f64 = parseInt(uint8ArrayToHex(priceResponse.ret), 16);

                    // update token usd price
                    const mutableState = sys.aspect.mutableState.get<Map<string, f64>>("tokenPriceMap");
                    mutableState.reload();  // reload state
                    let tokenPriceMap: Map<string, f64> = mutableState.unwrap();
                    tokenPriceMap.set(supportTokenList[i], tokenPrice);
                    mutableState.set<Map<string, f64>>(tokenPriceMap);
                }
          }

    }

    /**
     * postContractCall is a join-point which will be invoked after a contract call has finished.
     *
     * @param input input to the current join point
     */
    postContractCall(input: PostContractCallInput): void {

    }

    postTxExecute(input: PostTxExecuteInput): void {
        // trace internal call tree，check flashloan invoke
        var callTreeQuery = new CallTreeQuery(-1);
        let response = sys.hostApi.trace.queryCallTree(callTreeQuery)
        //if query index ==-1 result EthCallTree
        let callTree = Protobuf.decode<EthCallTree>(response, EthCallTree.decode);

        let flashLoanCall: FlashloanCall = this.getFlashloanCallFromEthCallTree(callTree.calls);

        const parentHash = sys.hostApi.runtimeContext.get("block.header.parentHash");
        // decode BytesData
        const parentHashData = Protobuf.decode<BytesData>(parentHash, BytesData.decode);

        const logs = sys.hostApi.runtimeContext.get('receipt.logs');
        // decode EthLogs
        const logsData = Protobuf.decode<EthLogs>(logs, EthLogs.decode);

        const tokenTransferList:TokenTransfer[] = 
        this.getTokenTransferListFromLogs(logsData.logs, uint8ArrayToHex(parentHashData.data));
        
        const nativeTransferList:TokenTransfer[] = 
        this.getTokenTransferListFromEthCallTree(callTree.calls, uint8ArrayToHex(parentHashData.data)); 

        // Ultimate fund flow aggregation
        const transferList:TokenTransfer[] = tokenTransferList.concat(nativeTransferList);

        // Establish fund flow map.
        let addressBalanceChangeMap: Map<string, Map<string, f64>>
        = this.buildAddressBalanceChangeMap(transferList);

        // TODO: handle lending debt token
        // Calculate the USD price of the token using a price oracle.
        let addressUsdProfitMap: Map<string, f64> 
        = this.buildAddressProfitMap(addressBalanceChangeMap);

        let arbitrage: FlashloanArbitrage = this.checkFlashloanArbitrage(
            flashLoanCall.isFlashloan,
            addressUsdProfitMap, 
            uint8ArrayToHex(input.tx!.from), 
            flashLoanCall.receivers, 
            uint8ArrayToHex(parentHashData.data));

        if (arbitrage.arbitrage == 1) {
            // save kyt info
            const mutableState = sys.aspect.mutableState.get<Map<string, FlashloanArbitrage[]>>("flashloanArbitrage");
            mutableState.reload();  // reload state
            let flashloanArbitrageMap: Map<string, FlashloanArbitrage[]> = mutableState.unwrap();
            let history: FlashloanArbitrage[] = flashloanArbitrageMap.get(uint8ArrayToHex(input.tx!.from));
            history.push(arbitrage);
            flashloanArbitrageMap.set(uint8ArrayToHex(input.tx!.from), history);
            mutableState.set<Map<string, FlashloanArbitrage[]>>(flashloanArbitrageMap);
        }

    }

    checkFlashloanArbitrage(
        isFlashloan: boolean,
        addressUsdProfitMap: Map<string, f64>, 
        launcher: string, 
        receivers: string[], 
        txHash: string): FlashloanArbitrage {
        // flashloan arbitrage check rule
        // TODO: accomplice check
        let criminalGroupTotalProfit: f64 = 0;
        if (!isNaN(addressUsdProfitMap.get(launcher))) {
            criminalGroupTotalProfit += addressUsdProfitMap.get(launcher);
        }

        for (let i: i32 = 0, len: i32 = receivers.length; i <len ; i++) {
            if (!isNaN(addressUsdProfitMap.get(receivers[i]))) {
                criminalGroupTotalProfit += addressUsdProfitMap.get(receivers[i]);
            }
        }

        let arbitrageType: f64 = 0;
        if (isFlashloan && 
            (criminalGroupTotalProfit >= this.flashloanArbitrageThreshold)) {
            arbitrageType = 1;
        } else if (isFlashloan && 
            (criminalGroupTotalProfit < this.flashloanArbitrageThreshold)) {
            arbitrageType = 2;
        } else if (!isFlashloan && 
            (criminalGroupTotalProfit >= this.flashloanArbitrageThreshold)) {
            arbitrageType = 3;
        }
        
        let arbitrage: FlashloanArbitrage = new FlashloanArbitrage(
            txHash,
            arbitrageType,
            launcher,
            receivers,
            criminalGroupTotalProfit,
            addressUsdProfitMap
        );

        return arbitrage;
    }

    buildAddressBalanceChangeMap(transferList:TokenTransfer[]): Map<string, Map<string, f64>> {
        // address => (token => amount)
        let addressBalanceChangeMap: Map<string, Map<string, f64>> = new Map();

        if (transferList === null || transferList.length == 0) {
            return addressBalanceChangeMap;
        }

        for (let i: i32 = 0, len: i32 = transferList.length; i <len ; i++) {
            let tokenAddress = transferList[i].tokenAddress;
            let from         = transferList[i].from;
            let to           = transferList[i].to;
            let amount       = transferList[i].amount;

            let fromBalanceChange: Map<string, f64> = addressBalanceChangeMap.get(from);
            let fromDelta: f64 = fromBalanceChange.get(tokenAddress);
            if (isNaN(fromDelta)) {
                fromDelta = 0;
            }
            fromDelta -= amount;
            fromBalanceChange.set(tokenAddress, fromDelta);
            addressBalanceChangeMap.set(from, fromBalanceChange);

            let toBalanceChange: Map<string, f64> = addressBalanceChangeMap.get(to);
            let toDelta: f64 = toBalanceChange.get(tokenAddress);
            if (isNaN(toDelta)) {
                toDelta = 0;
            }
            toDelta -= amount;
            toBalanceChange.set(tokenAddress, toDelta);
            addressBalanceChangeMap.set(to, toBalanceChange);
        }

        return addressBalanceChangeMap;
    }

    buildAddressProfitMap(addressBalanceChangeMap: Map<string, Map<string, f64>>): 
        Map<string, f64> {
            let addressUsdProfitMap: Map<string, f64> = new Map();
            if (addressBalanceChangeMap === null || addressBalanceChangeMap.size == 0) {
                return addressUsdProfitMap;
            }

            // TODO: handle lending debt token
            // get token price map
            const mutableState = sys.aspect.mutableState.get<Map<string, f64>>("tokenPriceMap");
            mutableState.reload();  // reload state
            let tokenPriceMap: Map<string, f64> = mutableState.unwrap();

            let keys = addressBalanceChangeMap.keys();
            for (let i: i32 = 0, k: i32 = keys.length; i < k; ++i) {
                let key = keys[i];
                let tokenChange: Map<string, f64> = addressBalanceChangeMap.get(key);

                let totalUsdChange: f64 = 0;

                let tokens = tokenChange.keys();
                for (let i: i32 = 0, k: i32 = tokens.length; i < k; ++i) {
                    let token = tokens[i];
                    let amount: f64 = tokenChange.get(token);
                    let tokenUsdPrice: f64 = tokenPriceMap.get(token);
                    if (isNaN(tokenUsdPrice)) {
                        tokenUsdPrice = 0;
                    }

                    totalUsdChange += tokenUsdPrice * amount;
                }

                addressUsdProfitMap.set(key, totalUsdChange);
            }

            return addressUsdProfitMap;
    }

    getTokenTransferFromLog(log: EthLog, txHash: string): TokenTransfer {
        let tokenAddress  = uint8ArrayToHex(log.address);
        let logIndex      = log.index;
        let from          = uint8ArrayToHex(log.topics[1]);
        let to            = uint8ArrayToHex(log.topics[2]);
        let data          = log.data;
        let tokenStandard = "ERC20";
        
        // ERC20
        if (log.topics[3] === null) {
            let amountRaw = uint8ArrayToHex(data);
            let amount = parseInt(amountRaw, 16);

            var erc20Transfer = new TokenTransfer(
                tokenAddress,
                tokenStandard,
                from,
                to,
                -1,
                amount,
                logIndex,
                0,
                txHash,
            );

            return erc20Transfer;
        
        } else {
            // ERC721
            tokenStandard = "ERC721";
            let tokenIdRaw = uint8ArrayToHex(log.topics[3]);
            let tokenId = parseInt(tokenIdRaw, 16);

            var erc721Transfer = new TokenTransfer(
                tokenAddress,
                tokenStandard,
                from,
                to,
                tokenId,
                1,
                logIndex,
                0,
                txHash,
            );

            return erc721Transfer;
        }
    }

    getTokenTransferListFromLogs(logs: EthLog[], txHash: string): TokenTransfer[] {
        var tokenTransferList:TokenTransfer[] = new Array(); 
        // Analyze the fund flows in this transaction.
        for (let i = 0; i < logs.length; i++) {
            if (logs[i] === null) {
                continue;
            }

            if (uint8ArrayToHex(logs[i].topics[0]) != ERC20_TRANSFER) {
                continue;
            }

            var tokenTransfer = this.getTokenTransferFromLog(
                logs[i], txHash);
            
            tokenTransferList.push(tokenTransfer);
        }

        return tokenTransferList;
    }

    getFlashloanCallFromEthCallTree(calls: Map<u64, EthCallMessage>): FlashloanCall {
        let flashloanReceivers: string[] = [];
        if (calls === null || calls.size == 0) {
            return new FlashloanCall(
                false,
                flashloanReceivers
            );
        }

        const flashLoanMethods : Array<string> = [
            ethereum.computeMethodSig('flashLoan()'),   // balancer, aave
            ethereum.computeMethodSig('flash()')        // uniswap v3
        ];

        // Simply traverse the call tree and check for flash loan invocations.
        let keys = calls.keys();

        for (let i: i32 = 0, k: i32 = keys.length; i < k; ++i) {
            let key = keys[i];
            let ethCall: EthCallMessage = calls.get(key);
            const currentCallMethod = ethereum.parseMethodSig(ethCall.data);
            if (flashLoanMethods.includes(currentCallMethod)) {
                // TODO: parse call data and get flashloan receivers
                return new FlashloanCall(
                    true,
                    flashloanReceivers
                );
            }
        }
        
        return new FlashloanCall(
            false,
            flashloanReceivers
        );
    }

    getTokenTransferListFromEthCallTree(calls: Map<u64, EthCallMessage>, txHash: string):TokenTransfer[] {
        var tokenTransferList: TokenTransfer[] = new Array(); 

        // Simply traverse the call tree and check for flash loan invocations.
        // let inTxs: EthCallMessage[] = calls.values;

        let keys = calls.keys();

        for (let i: i32 = 0, k: i32 = keys.length; i < k; ++i) {
            let key = keys[i];
            let ethCall: EthCallMessage = calls.get(key);
            let tokenAddress = NATIVE_TOKEN_ADDRESS;
            let logIndex = ethCall.index;  // TODO: 此处不知道是call顺序还是栈深度，需要确认
            let from = ethCall.from;
            let to = ethCall.to;
            let value = parseInt(uint8ArrayToHex(ethCall.value), 16);
            let tokenStandard = "native";

            if (value > 0) {
                var nativeTransfer = new TokenTransfer(
                    tokenAddress,
                    tokenStandard,
                    uint8ArrayToHex(from),
                    uint8ArrayToHex(to),
                    -1,
                    value,
                    logIndex,
                    0,
                    txHash,
                );
    
                tokenTransferList.push(nativeTransfer);
            }
        }

        return tokenTransferList;
    }

    isZeroTransferFrom(calls: Map<u64, EthCallMessage>): boolean {
            const targetMethod = ethereum.computeMethodSig('transferFrom')
            let inTxs = calls.values;
            let inTx: any;
            for (inTx in inTxs) {
                const currentCallMethod = ethereum.parseMethodSig(inTx.data);
                if (currentCallMethod === targetMethod && inTx.value === 0) {
                    return true;
                }
            }
            return false;
        }

    /**
     * uint8ArrayToAddressList is util function which convert contract return value(address array) into typescript address string list.
     *
     * @param data contract call output data
     */
    uint8ArrayToAddressList(data: Uint8Array): string[] {
        let addressList: string[] = [];
        if (data === null) {
            return addressList;
        }

        const hex = String.UTF8.decode(data.buffer, false);
        let dataList: string[] = [];

        // 切分 256 位十六进制数据
        
        for (let i: i32 = 0, len: i32 = hex.length; i <len ; i += 64) {
            dataList.push(hex.substring(i, i32(Math.min(i + 64, len))));
        }

        for (let i = 0; i < dataList.length; i++) {
            if (i + 2 < dataList.length) {
                addressList.push(dataList[i + 2].substring(24, 64));    // hex to address
            }
        }

        return addressList;
    }
}

// 2.register aspect Instance
const kytAspect = new KytAspect()
entryPoint.setAspect(kytAspect)

// 3.must export it
export { execute, allocate }
