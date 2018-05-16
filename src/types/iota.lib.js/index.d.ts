/**
 * Declations for iota.lib.js.
 */
declare module "iota.lib.js" {
    class IOTA {
        api: IOTA.IIotaApi;
        utils: IOTA.IIotaUtils;
        multisig: IOTA.IIotaMultisig;
        valid: IOTA.IIotaValid;

        version: string;

        constructor(settings:
            { provider: string; sandbox?: boolean; token?: boolean } |
            { host: string; port: number; sandbox?: boolean; token?: boolean }
        );
    }

    namespace IOTA {
        type Security = 1 | 2 | 3;
        type IOTAUnit = "i" | "Ki" | "Mi" | "Gi" | "Ti" | "Pi";

        interface ITransactionObject {
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

        interface ITransferObject {
            address: string;
            value: number;
            message: string;
            tag: string;
        }

        interface IInput {
            address: string;
            security: Security;
            keyIndex: number;
            balance: number;
        }

        interface INodeInfo {
            appName: string;
            appVersion: string;
            duration: number;
            jreAvailableProcessors: number;
            jreFreeMemory: number;
            jreMaxMemory: number;
            jreTotalMemory: number;
            latestMilestone: string;
            latestMilestoneIndex: number;
            latestSolidSubtangleMilestone: string;
            latestSolidSubtangleMilestoneIndex: number;
            neighbors: number;
            packetsQueueSize: number;
            time: number;
            tips: number;
            transactionsToRequest: number;
        }

        interface INeighbor {
            address: string;
            numberOfAllTransactions: number;
            numberOfInvalidTransactions: number;
            numberOfNewTransactions: number;
        }

        interface IIriApi {
            getNodeInfo(callback: (error: Error, success: INodeInfo) => void): void;
            getNeighbors(callback: (error: Error, neighbors: INeighbor[]) => void): void;
            addNeighbors(uris: string[], callback: (error: Error, addedNeighbors: number) => void): void;
            removeNeighbors(uris: string[], callback: (error: Error, removedNeighbors: number[]) => void): void;
            getTips(callback: (error: Error, hashes: string[]) => void): void;
            findTransactions(searchValues: { hashes?: string[]; bundles?: string[]; tags?: string[]; approvees?: string[] },
                callback: (error: Error, hashes: string[]) => void): void;
            getTrytes(hashes: string[], callback: (error: Error, trytes: string[]) => void): void;
            getInclusionStates(transactions: string[], tips: string[], callback: (error: Error, states: boolean[]) => void): void;
            getBalances(addresses: string[], treshold: number,
                callback: (error: Error, response: { balances: number[]; milestone: string; milestoneIndex: number; duration: number }) => void): void;
            getTransactionsToApprove(depth: number,
                callback: (error: Error, response: { trunkTransaction: string; branchTransaction: string; duration: number }) => void): void;
            attachToTangle(trunkTransaction: string, branchTransaction: string, minWeightMagnitude: number, trytes: string[],
                callback: (error: Error, trytes: string[]) => void): void;
            interruptAttachingToTangle(callback: (error: Error, response: {}) => void): void;
            broadcastTransactions(trytes: string[], callback: (error: Error, response: {}) => void): void;
            storeTransactions(trytes: string[], callback: (error: Error, response: {}) => void): void;
        }

        interface IIotaApi extends IIriApi {
            getTransactionsObjects(hashes: string[],
                callback?: (error: Error, transactions: ITransactionObject[]) => void): void;
            findTransactionObjects(searchValues: { hashes?: string[]; bundles?: string[]; tags?: string[]; approvees?: string[] },
                callback?: (error: Error, transactions: ITransactionObject[]) => void): void;
            getLatestInclusion(hashes: string[],
                callback?: (error: Error, states: boolean[]) => void): void;
            broadcastAndStore(trytes: string[],
                callback?: (error: Error, response: {}) => void): void;
            getNewAddress(seed: string, options?: { index?: number; checksum?: boolean; total?: number; security?: Security; returnAll?: boolean },
                callback?: (error: Error, response: string | string[]) => void): void;
            getInputs(seed: string, options?: { start?: number; end?: number; security?: Security; threshold?: boolean },
                callback?: (error: Error, response: { inputs: IInput[] }) => void): void;
            prepareTransfers(seed: string, transfers: ITransferObject[], options?: { inputs?: string[]; address?: string; security?: Security },
                callback?: (error: Error, response: { trytes: string[] }) => void): void;
            sendTrytes(trytes: string[], depth: number, minWeightMagnitude: number,
                callback?: (error: Error, response: { inputs: ITransactionObject[] }) => void): void;
            sendTransfer(seed: string, depth: number, minWeightMagnitude: number, transfers: ITransferObject[], options?: { inputs: string[]; address: string },
                callback?: (error: Error, response: ITransactionObject[]) => void): void;
            replayBundle(transactionHash: string, depth: number, minWeightMagnitude: number,
                callback?: (error: Error, response: {}) => void): void;
            broadcastBundle(transactionHash: string,
                callback?: (error: Error, response: {}) => void): void;
            getBundle(transactionHash: string,
                callback?: (error: Error, bundle: ITransactionObject[]) => void): void;
            getTransfers(seed: string, options?: { start?: number; end?: number; security?: Security; inclusionStates?: boolean },
                callback?: (error: Error, transfers: ITransactionObject[][]) => void): void;
            getAccountData(seed: string, options?: { start: number; end: number; security?: Security },
                callback?: (error: Error, response: { latestAddress: string; addresses: string[]; transfers: string[]; inputs: ITransferObject[]; balance: number }) => void): void;
            isReattachable(address: string | string[],
                callback?: (error: Error, response: boolean | boolean[]) => void): void;
        }

        interface IIotaUtils {
            convertUnits(value: number, fromUnit: IOTAUnit, toUnit: IOTAUnit): number;
            addChecksum(inputValue: string, checksumLength: number, isAddress: boolean): string;
            addChecksum(inputValue: string[], checksumLength: number, isAddress: boolean): string[];
            noChecksum(address: string): string;
            noChecksum(address: string[]): string[];
            isValidChecksum(addressWithChecksum: string): boolean;
            transactionObject(trytes: string): ITransactionObject;
            transactionTrytes(transaction: ITransactionObject): string;
            categorizeTransfers(transfers: ITransactionObject[], addresses: string[]): { sent: ITransactionObject[]; received: ITransactionObject[] };
            toTrytes(input: string): string;
            fromTrytes(trytes: string): string;
            extractJson(bundle: ITransactionObject[]): string;
            validateSignatures(signedBundle: string[], inputAddress: string): boolean;
            isBundle(bundle: ITransactionObject[]): boolean;
        }

        interface IIotaMultisig {
            getKey(seed: string, index: number, security: Security): string;
            getDigest(seed: string, index: number, security: Security): string;
            address(digestTrytes: string | string[]): IMultisigAddress;
            validateAddress(multisigAddress: string, digests: string[]): boolean;
            initiateTransfer(securitySum: number, inputAddress: string, remainderAddress: string, transfers: ITransferObject[],
                callback?: (error: Error, bundle: ITransactionObject[]) => void): void;
            addSignature(bundleToSign: ITransactionObject[], inputAddress: string, key: string,
                callback?: (error: Error, bundle: ITransactionObject[]) => void): void;
        }

        interface IMultisigAddress {
            absorb(digest: string | string[]): IMultisigAddress;
            finalize(): string;
        }

        interface IIotaValid {
            isAddress(address: string): boolean;
            isTrytes(trytes: string, length?: number): boolean;
            isValue(value: any): boolean;
            isNum(value: any): boolean;
            isHash(hash: any): boolean;
            isTransfersArray(transfers: any): boolean;
            isArrayOfHashes(hashes: any): boolean;
            isArrayOfTrytes(trytes: any): boolean;
            isArrayOfAttachedTrytes(trytes: any): boolean;
            isArrayOfTxObjects(transactions: any): boolean;
            isInputs(inputs: any): boolean;
            isString(string: any): boolean;
            isArray(array: any): boolean;
            isObject(object: any): boolean;
            isUri(uri: any): boolean;
        }
    }

    export = IOTA;
}
