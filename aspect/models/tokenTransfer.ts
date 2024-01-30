// SPDX-License-Identifier: GPL-3.0

class TokenTransfer {
    tokenAddress: string;
    tokenStandard: string;
    from: string;
    to: string;
    tokenId: f64;
    amount: f64;
    logIndex: u64;
    transferIndex: f64;
    transactionHash: string;

    constructor(
        tokenAddress: string,
        tokenStandard: string,
        from: string,
        to: string,
        tokenId: f64,
        amount: f64,
        logIndex: u64,
        transferIndex: f64,
        transactionHash: string
        ){
            this.tokenAddress = tokenAddress;
            this.tokenStandard = tokenStandard;
            this.from = from;
            this.to = to;
            this.tokenId = tokenId;
            this.amount = amount;
            this.logIndex = logIndex;
            this.transferIndex = transferIndex;
            this.transactionHash = transactionHash;
    }

}

export {TokenTransfer};