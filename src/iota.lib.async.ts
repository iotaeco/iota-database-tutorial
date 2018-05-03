import * as IOTA from "iota.lib.js";

export interface TransactionObject {
    hash: string;
    signatureMessageFragment: string;
    address: string;
    value: number;
    obsoleteTag: string;
    timestamp: number;
    currentIndex: number;
    lastIndex: number;
    bundle: string;
    trunkTransaction: string;
    branchTransaction: string;
    tag: string;
    attachmentTimestamp: number;
    attachmentTimestampLowerBound: number;
    attachmentTimestampUpperBound: number;
    nonce: string;
}

export async function getNewAddressAsync(iota: IOTA, seed: string, opts: { total: number; security: number }): Promise<string[]> {
    return new Promise<string[]>((resolve, reject) => {
        iota.api.getNewAddress(seed, opts, (err, res) => {
            if (err) {
                reject(err);
            } else {
                resolve(res);
            }
        });
    });
}

export async function sendTransferAsync(iota: IOTA, seed: string,
    depth: number,
    minWeightMagnitude: number,
    transfers: { address: string; value: number; message: number; tag: string; }[],
    opts?: any): Promise<TransactionObject[]> {
    return new Promise<TransactionObject[]>((resolve, reject) => {
        iota.api.sendTransfer(seed, depth, minWeightMagnitude, transfers, opts || {}, (err, res) => {
            if (err) {
                reject(err);
            } else {
                resolve(res);
            }
        });
    });
}

export async function findTransactionObjectsAsync(iota: IOTA,
    searchValues: {
        bundles?: string[];
        addresses?: string[];
        tags?: string[];
        approvees?: string[];
    }): Promise<TransactionObject[]> {
    return new Promise<TransactionObject[]>((resolve, reject) => {
        iota.api.findTransactionObjects(searchValues, (err, res) => {
            if (err) {
                reject(err);
            } else {
                resolve(res);
            }
        });
    });
}
