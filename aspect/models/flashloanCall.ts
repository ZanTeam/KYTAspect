// SPDX-License-Identifier: GPL-3.0

class FlashloanCall {
    isFlashloan: boolean;
    receivers: string[];

    constructor(
        isFlashloan: boolean,
        receivers: string[]
        ){
            this.isFlashloan = isFlashloan;
            this.receivers = receivers;
    }
}

export {FlashloanCall};