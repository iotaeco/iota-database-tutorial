"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Helper functions for use with iota lib.
 */
class IotaHelper {
    /**
     * Implements iota.lib findTransactionObjects as async.
     * @param iotaInstance The iota lib instance.
     * @param searchValues The search values to find.
     * @returns The transaction objects found.
     */
    static async findTransactionObjectsAsync(iotaInstance, searchValues) {
        return new Promise((resolve, reject) => {
            iotaInstance.api.findTransactionObjects(searchValues, (err, res) => {
                if (err) {
                    reject(err);
                }
                else {
                    resolve(res);
                }
            });
        });
    }
    /**
     * Implements getNewAddress as async.
     * @param iotaInstance The iota lib instance.
     * @param seed The seed to get the address for.
     * @param opts The options.
     * @returns Addresses.
     */
    static async getNewAddressAsync(iotaInstance, seed, opts) {
        return new Promise((resolve, reject) => {
            iotaInstance.api.getNewAddress(seed, opts, (err, res) => {
                if (err) {
                    reject(err);
                }
                else {
                    resolve(res);
                }
            });
        });
    }
    /**
     * Implements sendTransfer as async.
     * @param iotaInstance The iota lib instance.
     * @param seed The seed to get the address for.
     * @param depth The depth.
     * @param minWeightMagnitude The mininum weight magnitude.
     * @param transfers The transfers to send.
     * @param opts The options
     * @returns The transaction objects.
     */
    static async sendTransferAsync(iotaInstance, seed, depth, minWeightMagnitude, transfers, opts) {
        return new Promise((resolve, reject) => {
            iotaInstance.api.sendTransfer(seed, depth, minWeightMagnitude, transfers, opts || {}, (err, res) => {
                if (err) {
                    reject(err);
                }
                else {
                    resolve(res);
                }
            });
        });
    }
    /**
     * Encode Non ASCII characters to escaped characters.
     * @param value The value to encode.
     * @returns The encoded value.
     */
    static encodeNonASCII(value) {
        return value ? value.replace(/[\u007F-\uFFFF]/g, (chr) => `\\u${(`0000${chr.charCodeAt(0).toString(16)}`).substr(-4)}`) : undefined;
    }
    /**
     * Decode escaped Non ASCII characters.
     * @param value The value to decode.
     * @returns The decoded value.
     */
    static decodeNonASCII(value) {
        return value ? value.replace(/\\u([\d\w]{4})/gi, (match, grp) => String.fromCharCode(parseInt(grp, 16))) : undefined;
    }
    /**
     * Extra only the first objects from the bundles.
     * @param iotaInstance The iota lib object.
     * @param txObjects The transaction objects.
     * @returns The extracted objects.
     */
    static extractBundles(iotaInstance, txObjects) {
        const bundles = {};
        txObjects.forEach(tx => {
            bundles[tx.bundle] = bundles[tx.bundle] || [];
            bundles[tx.bundle].push(tx);
        });
        const objs = [];
        Object.keys(bundles).forEach(hash => {
            // We only want one transaction from the bundle not reattachments
            // Sort all the transactions by timestamp so we can just get earliest
            bundles[hash].sort((a, b) => a.attachmentTimestamp - b.attachmentTimestamp);
            // Now look at the first entry and see how many parts it has
            const numParts = bundles[hash][0].lastIndex;
            // Grab that amount of entries
            const finalEntries = bundles[hash].slice(0, numParts + 1);
            // Sort each of the bundle transactions by index
            finalEntries.sort((a, b) => a.currentIndex - b.currentIndex);
            const json = iotaInstance.utils.extractJson(finalEntries);
            const data = IotaHelper.decodeNonASCII(json);
            objs.push(JSON.parse(data));
        });
        return objs;
    }
}
exports.IotaHelper = IotaHelper;
