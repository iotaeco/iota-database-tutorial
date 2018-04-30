"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
async function getNewAddressAsync(iota, seed, opts) {
    return new Promise((resolve, reject) => {
        iota.api.getNewAddress(seed, opts, (err, res) => {
            if (err) {
                reject(err);
            }
            else {
                resolve(res);
            }
        });
    });
}
exports.getNewAddressAsync = getNewAddressAsync;
async function sendTransferAsync(iota, seed, depth, minWeightMagnitude, transfers, opts) {
    return new Promise((resolve, reject) => {
        iota.api.sendTransfer(seed, depth, minWeightMagnitude, transfers, opts || {}, (err, res) => {
            if (err) {
                reject(err);
            }
            else {
                resolve(res);
            }
        });
    });
}
exports.sendTransferAsync = sendTransferAsync;
async function findTransactionObjectsAsync(iota, searchValues) {
    return new Promise((resolve, reject) => {
        iota.api.findTransactionObjects(searchValues, (err, res) => {
            if (err) {
                reject(err);
            }
            else {
                resolve(res);
            }
        });
    });
}
exports.findTransactionObjectsAsync = findTransactionObjectsAsync;
