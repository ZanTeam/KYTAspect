// SPDX-License-Identifier: GPL-3.0

class FlashloanArbitrage {
    txHash: string;
    arbitrage: f64;      // arbitrage type: 0: not flashloan aribitrage 1: flashloan arbitrage 2: flashloan 3: arbitrage
    launcher: string;
    receivers: string[];
    usdProfit: f64;
    actualAddressBalanceChange: Map<string, f64>;

    constructor(
        txHash: string,
        arbitrage: f64,
        launcher: string,
        receivers: string[],
        usdProfit: f64,
        actualAddressBalanceChange: Map<string, f64>
        ){
            this.txHash = txHash;
            this.arbitrage = arbitrage;
            this.launcher = launcher;
            this.receivers = receivers;
            this.usdProfit = usdProfit;
            this.actualAddressBalanceChange = actualAddressBalanceChange;
    }
}

export {FlashloanArbitrage};