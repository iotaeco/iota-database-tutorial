import * as ccurl from "ccurl.interface.js";
import chalk from "chalk";
import * as crypto from "crypto";
import * as fs from "fs";
import * as IOTA from "iota.lib.js";
import * as minimist from "minimist";
import * as os from "os";
import * as path from "path";
import * as util from "util";
import { IotaHelper } from "./helpers/iotaHelper";
import { Configuration } from "./models/configuration";
import { IDataTableIndex } from "./models/IDataTableIndex";

/**
 * Create the iota instance.
 */
const iota = new IOTA({
    provider: "http://nodes.iota.fm:80"
});

attachCcurl(iota);

const configFile = "./data/db-config.json";
const pubKeyFile = "./data/pub.key";
const privKeyFile = "./data/priv.key";

/**
 * Process the command line options.
 */
async function tutorial(): Promise<void> {
    logBanner(`IOTA Database Tutorial`);
    logBanner(`======================`);
    logBanner(``);

    const argv = minimist<
        {
            seed?: string;
            tables?: string;
            table?: string;
            data?: string;
            tag?: string;
            id?: string;
            ids?: string;
        }
        >(process.argv.slice(2));

    if (argv._.indexOf("init") >= 0) {
        await init(argv.seed, argv.tables);
    } else if (argv._.indexOf("index") >= 0) {
        await index(argv.table);
    } else if (argv._.indexOf("create") >= 0) {
        await createOrUpdateItem(argv.table, argv.data, undefined, argv.tag);
    } else if (argv._.indexOf("update") >= 0) {
        await createOrUpdateItem(argv.table, argv.data, argv.id, argv.tag);
    } else if (argv._.indexOf("read") >= 0) {
        await readItem(argv.table, argv.ids);
    } else if (argv._.indexOf("delete") >= 0) {
        await deleteItem(argv.table, argv.id);
    } else {
        throw new Error(`Please specify one of the following commands [init].`);
    }
}

/**
 * Initialise the database.
 * @param seed The seed to create the addresses from.
 * @param tables The name of the tables to create.
 * @returns The configuration object.
 */
async function init(seed: string, tables: string): Promise<Configuration> {
    try {
        logInfo(`command: Initialise`);

        if (!iota.valid.isTrytes(seed, 81)) {
            throw new Error(`ERROR seed is not valid: ${seed}`);
        }

        if (!tables || tables.length === 0) {
            throw new Error(`ERROR tables is not valid: ${tables}`);
        }

        const tablesList = tables.split(",").map(t => t.trim());

        logInfo(`seed: ${seed}`);
        logInfo(`tables: ${tablesList.join(", ")}`);

        logProgress(`Generating Addresses`);

        const config: Configuration = {};

        const addresses = await IotaHelper.getNewAddressAsync(iota, seed, {
            total: tablesList.length * 2,
            security: 2
        });

        for (let i = 0; i < tablesList.length; i++) {
            const tableName = tablesList[i];

            config[tableName] = {
                indexAddress: addresses[i * 2],
                dataAddress: addresses[(i * 2) + 1],
                currentIndex: ""
            };

            logInfo(`\t${tableName} Index Address: ${config[tableName].indexAddress}`);
            logInfo(`\t${tableName} Data Address: ${config[tableName].dataAddress}`);
        }

        await writeConfigFile(config);

        logSuccess(`Database initialised and db-config.json file written.`);

        return config;
    } catch (err) {
        throw new Error(`ERROR Unable to initialise database:\n\n${err.stack}`);
    }
}

/**
 * Retrieve the index for the database table from the tangle.
 * @param table The name of the table to retreive the index for.
 * @returns The table index hashes and previous index address.
 */
async function index(table: string): Promise<IDataTableIndex> {
    try {
        logInfo(`command: index`);

        if (!table || table.length === 0) {
            throw new Error(`ERROR table is not valid: ${table}`);
        }

        const config = await readConfigFile();

        if (!config[table]) {
            throw new Error(`ERROR table '${table}' does not exits in db-config.json`);
        }

        const loadedIndex = await loadIndex(config[table].currentIndex);

        if (loadedIndex.bundles.length > 0) {
            logSuccess(`Index hashes:`);
            logSuccess(`\t${loadedIndex.bundles.join("\n\t")}`);
        } else {
            logSuccess("No index.");
        }

        return loadedIndex;
    } catch (err) {
        throw new Error(`ERROR Unable to load database table index:\n\n${err.stack}`);
    }
}

/**
 * Read items from the tangle database.
 * @param table The table to read the items from.
 * @param ids The ids of the items to read, optional reads all if not supplied.
 * @returns The object read from the database table.
 */
async function readItem(table: string, ids?: string): Promise<any[]> {
    try {
        logInfo(`command: read`);

        if (!table || table.length === 0) {
            throw new Error(`ERROR table is not valid: ${table}`);
        }

        const config = await readConfigFile();

        if (!config[table]) {
            throw new Error(`ERROR table '${table}' does not exits in db-config.json`);
        }

        let loadedIndex: IDataTableIndex;
        if (ids) {
            loadedIndex = { bundles: ids.split(","), lastIdx: "" };
        } else {
            loadedIndex = await loadIndex(config[table].currentIndex);
        }

        logProgress(`Reading items from Tangle`);

        const txObjects = await IotaHelper.findTransactionObjectsAsync(iota, { bundles: loadedIndex.bundles });

        const objs = IotaHelper.extractBundles(iota, txObjects);

        for (let i = 0; i < objs.length; i++) {
            const verified = await verifyData(objs[i]);
            if (!verified) {
                throw new Error("ERROR Signature on item is invalid");
            }
            logInfo(JSON.stringify(objs[i], undefined, "\t"));
        }

        return objs;
    } catch (err) {
        throw new Error(`ERROR Unable to read item:\n\n${err.stack}`);
    }
}

/**
 *
 * @param table The table to create or update the item.
 * @param data The file to load the data from.
 * @param id Optional, if supplied will update the specified item.
 * @param tag Optional, tag to associated with the data on the tangle.
 * @returns The hash of the new object.
 */
async function createOrUpdateItem(table: string, data: string, id?: string, tag: string = ""): Promise<string> {
    try {
        logInfo(`command: ${id ? "update" : "create"}`);

        const finalTag = ((tag || "") + "9".repeat(27)).substr(0, 27);

        if (!table || table.length === 0) {
            throw new Error(`ERROR table is not valid: ${table}`);
        }

        if (!data || data.length === 0) {
            throw new Error(`ERROR data is not valid: ${data}`);
        }

        if (!iota.valid.isTrytes(finalTag, 27)) {
            throw new Error(`ERROR tag is not valid: ${finalTag}`);
        }

        const config = await readConfigFile();

        if (!config[table]) {
            throw new Error(`ERROR table '${table}' does not exits in db-config.json`);
        }

        logProgress(`Reading ${data}`);

        const jsonFile = await util.promisify(fs.readFile)(data);

        const obj = JSON.parse(jsonFile.toString());

        obj.sig = await signData(obj);

        const ascii = IotaHelper.encodeNonASCII(JSON.stringify(obj));

        logProgress(`Adding Data to Tangle`);

        logProgress(`Performing Proof of Work`);
        const txObjects = await IotaHelper.sendTransferAsync(iota, "", 1, 15, [
            {
                address: config[table].dataAddress,
                value: 0,
                message: iota.utils.toTrytes(ascii),
                tag: finalTag
            }
        ]);

        logProgress(`Item saved as bundle '${txObjects[0].bundle}'`);

        const loadedIndex = await loadIndex(config[table].currentIndex);

        if (id) {
            const idx = loadedIndex.bundles.indexOf(id);
            if (idx >= 0) {
                logProgress(`Removing old hash from the index`);
                loadedIndex.bundles.splice(idx, 1);
            }
        }

        logProgress(`Adding new hash to the index`);

        loadedIndex.bundles.push(txObjects[0].bundle);

        config[table].currentIndex = await saveIndex(config[table].indexAddress, loadedIndex, config[table].currentIndex);

        await writeConfigFile(config);

        logSuccess(`Item ${id ? "updated" : "added"}, you should be able to see the data on the tangle at the following link.`);
        logSuccess(`\tFirst Tx: https://thetangle.org/transaction/${txObjects[0].hash}`);
        logSuccess(`\tBundle: https://thetangle.org/bundle/${txObjects[0].bundle}`);
        logSuccess(`\nThe new index is available here.`);
        logSuccess(`\thttps://thetangle.org/bundle/${config[table].currentIndex}`);

        return txObjects[0].bundle;
    } catch (err) {
        throw new Error(`ERROR Unable to ${id ? "update" : "add"} item to the database:\n\n${err.stack}`);
    }
}

/**
 * Delete an item from the database table.
 * @param table The table to delete the item from.
 * @param id The id of the item to delete.
 */
async function deleteItem(table: string, id: string): Promise<void> {
    try {
        logInfo(`command: delete`);

        if (!table || table.length === 0) {
            throw new Error(`ERROR table is not valid: ${table}`);
        }

        if (!id || id.length === 0) {
            throw new Error(`ERROR id is not valid: ${id}`);
        }

        const config = await readConfigFile();

        if (!config[table]) {
            throw new Error(`ERROR table '${table}' does not exits in db-config.json`);
        }

        const loadedIndex = await loadIndex(config[table].currentIndex);

        const idx = loadedIndex.bundles.indexOf(id);
        if (idx >= 0) {
            logProgress(`Removing hash from the index`);

            loadedIndex.bundles.splice(idx, 1);

            config[table].currentIndex = await saveIndex(config[table].indexAddress, loadedIndex, config[table].currentIndex);

            await writeConfigFile(config);

            logSuccess(`Deleted Item ${id}.`);
        } else {
            logSuccess(`Item ${id} is not in the current index.`);
        }
    } catch (err) {
        throw new Error(`ERROR Unable to remove item from the database:\n\n${err.stack}`);
    }
}

/**
 * Load the table index from the tangle.
 * @param tableIndexHash The hash of the table index to load.
 * @returns The table index.
 */
async function loadIndex(tableIndexHash: string): Promise<IDataTableIndex> {
    logProgress(`Loading Index from the Tangle`);

    if (!tableIndexHash || tableIndexHash.length === 0) {
        return {
            bundles: [],
            lastIdx: undefined
        };
    } else {
        const txObjects = await IotaHelper.findTransactionObjectsAsync(
            iota,
            { bundles: [tableIndexHash] }
        );

        const indexes = IotaHelper.extractBundles<IDataTableIndex>(iota, txObjects);

        if (indexes && indexes.length > 0) {
            const currentIndex = indexes[0];
            const verified = await verifyData(currentIndex);

            if (!verified) {
                throw(new Error("ERROR Signature on index is invalid"));
            }

            currentIndex.bundles = currentIndex.bundles || [];
            return currentIndex;
        } else {
            return {
                bundles: [],
                lastIdx: undefined
            };
        }
    }
}

/**
 * Save an index to the tangle.
 * @param indexAddress The address where the table index is stored.
 * @param saveIdx The index to save.
 * @param currentIndex The current index hash.
 * @returns The hash of the new index.
 */
async function saveIndex(indexAddress: string, saveIdx: IDataTableIndex, currentIndex: string): Promise<string> {
    logProgress(`Saving Index to the Tangle`);

    saveIdx.lastIdx = currentIndex;
    saveIdx.sig = await signData(saveIdx);

    logProgress(`Performing Proof of Work`);
    const txObjects = await IotaHelper.sendTransferAsync(iota, "", 1, 15, [
        {
            address: indexAddress,
            value: 0,
            message: iota.utils.toTrytes(JSON.stringify(saveIdx)),
            tag: "INDEX9999999999999999999999"
        }
    ]);

    return txObjects[0].bundle;
}

/**
 * Write the configuration to a file.
 * @param config The configuration to save.
 */
async function writeConfigFile(config: Configuration): Promise<void> {
    logProgress(`Writing db-config.json`);
    await util.promisify(fs.writeFile)(configFile, JSON.stringify(config, undefined, "\t"));
}

/**
 * Read the configuration from a file.
 * @returns The configuration.
 */
async function readConfigFile(): Promise<Configuration> {
    logProgress(`Reading db-config.json`);
    const file = await util.promisify(fs.readFile)(configFile);
    return JSON.parse(file.toString());
}

/**
 * Sign the data.
 * @param data The data to sign.
 * @returns Signed data.
 */
async function signData(data: any): Promise<string> {
    delete data.sig;
    const json = JSON.stringify(data);

    const file = await util.promisify(fs.readFile)(privKeyFile);

    const signer = crypto.createSign("RSA-SHA256");
    signer.update(json);
    return signer.sign(file.toString(), "hex");
}

/**
 * Verify the data.
 * @param data The data to verify.
 * @returns True if verified.
 */
async function verifyData(data: any): Promise<boolean> {
    if (!data.sig) {
        return false;
    } else {
        const signature = data.sig;
        delete data.sig;
        const json = JSON.stringify(data);

        const publicKey = await util.promisify(fs.readFile)(pubKeyFile);

        const verifier = crypto.createVerify("RSA-SHA256");
        verifier.update(json);
        return verifier.verify(publicKey.toString(), signature, "hex");
    }
}

/**
 * Log message as banner text.
 * @param message The message to log.
 */
function logBanner(message: string): void {
    // tslint:disable-next-line:no-console
    console.log(chalk.green(message));
}

/**
 * Log message as info text.
 * @param message The message to log.
 */
function logInfo(message: string): void {
    // tslint:disable-next-line:no-console
    console.info(chalk.cyan(message));
}

/**
 * Log message as error text.
 * @param message The message to log.
 */
function logError(message: string): void {
    console.error(chalk.red(message));
}

/**
 * Log message as success text.
 * @param message The message to log.
 */
function logSuccess(message: string): void {
    // tslint:disable-next-line:no-console
    console.log(chalk.green(message));
}

/**
 * Log message as progress text.
 * @param message The message to log.
 */
function logProgress(message: string): void {
    console.error(chalk.yellow(`\n${message}`));
}

/**
 * Attach the ccurl proof of work algorithm.
 * @param iotaInstance The iota lib object.
 */
function attachCcurl(iotaInstance: IOTA): void {
    iota.api.attachToTangle = ccurlAttachToTangle;
}

/**
 * Perform proof of work using CCurl.
 * @param trunkTransaction The trunk transaction.
 * @param branchTransaction The branch transaction.
 * @param minWeightMagnitude The minimum weight magnitude transaction.
 * @param trytes The trytes to perform pow on.
 * @param callback The callback
 */
function ccurlAttachToTangle(
    trunkTransaction: string,
    branchTransaction: string,
    minWeightMagnitude: number,
    trytes: string[],
    callback: (err: Error, trytes: string[]) => void
): void {
    const ccurlPath = path.join(__dirname, "../", "binaries", os.platform());
    ccurl(
        trunkTransaction,
        branchTransaction,
        minWeightMagnitude,
        trytes,
        ccurlPath,
        callback
    );
}

tutorial()
    .then(() => logInfo("Success"))
    .catch(logError);
