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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW90YUhlbHBlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9oZWxwZXJzL2lvdGFIZWxwZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUVBOztHQUVHO0FBQ0g7SUFDSTs7Ozs7T0FLRztJQUNJLE1BQU0sQ0FBQyxLQUFLLENBQUMsMkJBQTJCLENBQUMsWUFBa0IsRUFDbEIsWUFLM0M7UUFDRCxNQUFNLENBQUMsSUFBSSxPQUFPLENBQTRCLENBQUMsT0FBTyxFQUFFLE1BQU0sRUFBRSxFQUFFO1lBQzlELFlBQVksQ0FBQyxHQUFHLENBQUMsc0JBQXNCLENBQUMsWUFBWSxFQUFFLENBQUMsR0FBRyxFQUFFLEdBQUcsRUFBRSxFQUFFO2dCQUMvRCxFQUFFLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDO29CQUNOLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQztnQkFDaEIsQ0FBQztnQkFBQyxJQUFJLENBQUMsQ0FBQztvQkFDSixPQUFPLENBQUMsR0FBRyxDQUFDLENBQUM7Z0JBQ2pCLENBQUM7WUFDTCxDQUFDLENBQUMsQ0FBQztRQUNQLENBQUMsQ0FBQyxDQUFDO0lBQ1AsQ0FBQztJQUVEOzs7Ozs7T0FNRztJQUNJLE1BQU0sQ0FBQyxLQUFLLENBQUMsa0JBQWtCLENBQUMsWUFBa0IsRUFBRSxJQUFZLEVBQ2hDLElBQTJHO1FBRTlJLE1BQU0sQ0FBQyxJQUFJLE9BQU8sQ0FBb0IsQ0FBQyxPQUFPLEVBQUUsTUFBTSxFQUFFLEVBQUU7WUFDdEQsWUFBWSxDQUFDLEdBQUcsQ0FBQyxhQUFhLENBQUMsSUFBSSxFQUFFLElBQUksRUFBRSxDQUFDLEdBQUcsRUFBRSxHQUFHLEVBQUUsRUFBRTtnQkFDcEQsRUFBRSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztvQkFDTixNQUFNLENBQUMsR0FBRyxDQUFDLENBQUM7Z0JBQ2hCLENBQUM7Z0JBQUMsSUFBSSxDQUFDLENBQUM7b0JBQ0osT0FBTyxDQUFDLEdBQUcs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