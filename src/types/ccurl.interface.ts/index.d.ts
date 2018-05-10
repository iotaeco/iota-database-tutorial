/**
 * Declations for ccurl.interface.js.
 */
declare module "ccurl.interface.js" {
    function ccurlAttachToTangle (
        trunkTransaction: string,
        branchTransaction: string,
        minWeightMagnitude: number,
        trytes: string[],
        ccurlPath: string,
        callback: (err: Error, trytes: string[]) => void
    ): void;

    namespace ccurlAttachToTangle {
    }

    export = ccurlAttachToTangle;
}
