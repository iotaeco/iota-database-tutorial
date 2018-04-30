import * as ccurl from "ccurl.interface.js";
import chalk from "chalk";
import * as fs from "fs";
import * as IOTA from "iota.lib.js";
import * as minimist from "minimist";
import * as os from "os";
import * as path from "path";
import * as util from "util";
import * as iotaAsync from "./iota.lib.async";
import { Configuration } from "./configuration";

/**
 * Create the iota instance.
 */
const iota = new IOTA({
    //provider: "http://iotanode.host:14265"
    provider: "http://nodes.iota.fm:80"
});

/**
 * Attach the ccurl proof of work algorithm.
 */
iota.api.attachToTangle = ccurlAttachToTangle;

/**
 * Process the command line options.
 */
(async function () {
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

    try {
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
            throw(`Please specify one of the following commands [init].`);
        }
    } catch (err) {
        logError(err);
    }        
})();

/**
 * Initialise the database.
 * @param seed The seed to create the addresses from.
 * @param tables The name of the tables to create.
 * @return The configuration object.
 */
async function init(seed: string, tables: string): Promise<Configuration> {
    try {
        logInfo(`command: Initialise`);

        if (!iota.valid.isTrytes(seed, 81)) {
            throw(`ERROR seed is not valid: ${seed}`);
        }

        if (!tables || tables.length === 0) {
            throw(`ERROR tables is not valid: ${tables}`);
        }

        const tablesList = tables.split(",").map(t => t.trim());

        logInfo(`seed: ${seed}`);
        logInfo(`tables: ${tablesList.join(", ")}`);

        logProgress(`Generating Addresses`);

        const config: Configuration = {};

        const addresses = await iotaAsync.getNewAddressAsync(iota, seed, {
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
        throw(`ERROR Unable to initialise database:\n\n${err.stack}`);
    }
}

/**
 * Retrieve the index for the database table from the tangle.
 * @param table The name of the table to retreive the index for.
 * @returns The table index hashes.
 */
async function index(table: string): Promise<string[]> {
    try {
        logInfo(`command: index`);

        if (!table || table.length === 0) {
            throw(`ERROR table is not valid: ${table}`);
        }

        const config = await readConfigFile();

        if (!config[table]) {
            throw(`ERROR table '${table}' does not exits in db-config.json`);
        }

        const index = await loadIndex(config[table].currentIndex);

        if (index && index.length > 0) {
            logSuccess(`Index hashes:`);
            logSuccess(`\t${index.join("\n\t")}`);
        } else {
            logSuccess("No index.");
        }

        return index;
    } catch (err) {
        throw(`ERROR Unable to load database table index:\n\n${err.stack}`);
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
            throw(`ERROR table is not valid: ${table}`);
        }

        const config = await readConfigFile();

        if (!config[table]) {
            throw(`ERROR table '${table}' does not exits in db-config.json`);
        }

        let index;
        if (ids) {
            index = ids.split(",");
        } else {
            index = await loadIndex(config[table].currentIndex);
        }

        logProgress(`Reading items from Tangle`);

        const txObjects = await iotaAsync.findTransactionObjectsAsync(iota, { bundles: index });

        const bundles: { [hash: string]: iotaAsync.TransactionObject[] } = {};

        txObjects.forEach(tx => {
            bundles[tx.bundle] = bundles[tx.bundle] || [];
            bundles[tx.bundle].push(tx);
        });

        const objs = [];
        Object.keys(bundles).forEach(hash => {
            bundles[hash].sort((a, b) => a.currentIndex - b.currentIndex);

            const json = iota.utils.extractJson(bundles[hash]);

            const data = decodeNonASCII(json);

            objs.push(JSON.parse(data));

            logInfo(`Item: ${hash}`);
            logInfo(`${data}`);
        });

        return objs;
    } catch (err) {
        throw(`ERROR Unable to read item:\n\n${err.stack}`);
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

        tag = ((tag || "") + "9".repeat(27)).substr(0, 27);

        if (!table || table.length === 0) {
            throw(`ERROR table is not valid: ${table}`);
        }

        if (!data || data.length === 0) {
            throw(`ERROR data is not valid: ${data}`);
        }

        if (!iota.valid.isTrytes(tag, 27)) {
            throw(`ERROR tag is not valid: ${tag}`);
        }

        const config = await readConfigFile();

        if (!config[table]) {
            throw(`ERROR table '${table}' does not exits in db-config.json`);
        }

        logProgress(`Reading ${data}`);

        const jsonFile = await util.promisify(fs.readFile)(data);

        const ascii = encodeNonASCII(jsonFile.toString());

        logProgress(`Adding Data to Tangle`);

        logProgress(`Performing Proof of Work`);
        const txObjects = await iotaAsync.sendTransferAsync(iota, "", 1, 15, [
            {
                address: config[table].dataAddress,
                value: 0,
                message: iota.utils.toTrytes(ascii),
                tag
            }
        ]);

        logProgress(`Item saved as bundle '${txObjects[0].bundle}'`);

        const index = await loadIndex(config[table].currentIndex);

        if (id) {
            const idx = index.indexOf(id);
            if (idx >= 0) {
                logProgress(`Removing old hash from the index`);
                index.splice(idx, 1);
            }
        }

        logProgress(`Adding new hash to the index`);

        index.push(txObjects[0].bundle);

        config[table].currentIndex = await saveIndex(config[table].indexAddress, index);

        await writeConfigFile(config);

        logSuccess(`Item ${id ? "updated" : "added"}, you should be able to see the data on the tangle at the following link.`);
        logSuccess(`\tFirst Tx: https://thetangle.org/transaction/${txObjects[0].hash}`);
        logSuccess(`\tBundle: https://thetangle.org/bundle/${txObjects[0].bundle}`);
        logSuccess(`\nThe new index is available here.`);
        logSuccess(`\thttps://thetangle.org/bundle/${config[table].currentIndex}`);

        return txObjects[0].bundle;
    } catch (err) {
        throw(`ERROR Unable to ${id ? "update" : "add"} item to the database:\n\n${err.stack}`);
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
            throw(`ERROR table is not valid: ${table}`);
        }

        if (!id || id.length === 0) {
            throw(`ERROR id is not valid: ${id}`);
        }

        const config = await readConfigFile();

        if (!config[table]) {
            throw(`ERROR table '${table}' does not exits in db-config.json`);
        }

        const index = await loadIndex(config[table].currentIndex);

        const idx = index.indexOf(id);
        if (idx >= 0) {
            logProgress(`Removing hash from the index`);
    
            index.splice(idx, 1);

            config[table].currentIndex = await saveIndex(config[table].indexAddress, index);

            await writeConfigFile(config);

            logSuccess(`Deleted Item ${id}.`);
        } else {
            logSuccess(`Item ${id} is not in the current index.`);
        }
    } catch (err) {
        throw(`ERROR Unable to remove item from the database:\n\n${err.stack}`);
    }
}

/**
 * Load the table index from the tangle.
 * @param tableIndexHash The hash of the table index to load.
 * @returns The table index.
 */
async function loadIndex(tableIndexHash: string): Promise<string[]> {
    logProgress(`Loading Index from the Tangle`);

    if (!tableIndexHash || tableIndexHash.length === 0) {
        return [];
    } else {
        const txObjects = await iotaAsync.findTransactionObjectsAsync(iota,
            { bundles: [tableIndexHash] }
        );

        txObjects.sort((a, b) => a.currentIndex - b.currentIndex);

        const json = iota.utils.extractJson(txObjects);

        const obj = JSON.parse(json);

        return (obj ? obj.indexes : undefined) || [];
    }
}

/**
 * Save an index to the tangle.
 * @param indexAddress The address where the table index is stored. 
 * @param index The index to save.
 * @returns The hash of the new index.
 */
async function saveIndex(indexAddress: string, index: string[]): Promise<string> {
    logProgress(`Saving Index to the Tangle`);

    logProgress(`Performing Proof of Work`);
    const txObjects = await iotaAsync.sendTransferAsync(iota, "", 1, 15, [
        {
            address: indexAddress,
            value: 0,
            message: iota.utils.toTrytes(JSON.stringify({ indexes: index })),
            tag: "INDEX9999999999999999999999"
        }
    ]);

    return txObjects[0].bundle;
}

/**
 * Write the configuration to a file.
 * @param configuration The configuration to save.
 */
async function writeConfigFile(config: Configuration): Promise<void> {
    logProgress(`Writing db-config.json`);
    await util.promisify(fs.writeFile)("./db-config.json", JSON.stringify(config, undefined, "\t"));
}

/**
 * Read the confiuration from a file.
 * @return The configuration.
 */
async function readConfigFile(): Promise<Configuration> {
    logProgress(`Reading db-config.json`);
    const file = await util.promisify(fs.readFile)("./db-config.json");
    return JSON.parse(file.toString());
}

/**
 * Perform proof of work using CCurl.
 */
function ccurlAttachToTangle(
    trunkTransaction: string,
    branchTransaction: string,
    minWeightMagnitude: number,
    trytes: string,
    callback: (err: Error, result: string) => void
): void {
    const ccurlPath = path.join(__dirname, 'binaries', os.platform());
    ccurl(
        trunkTransaction,
        branchTransaction,
        minWeightMagnitude,
        trytes,
        ccurlPath,
        (error, success) => {
            return callback(error, success);
        }
    );
}

/**
 * Encode Non ASCII characters to escaped characters.
 * @param value The value to encode.
 */
function encodeNonASCII(value: string): string {
    return value ? value.replace(/[\u007F-\uFFFF]/g, (chr) => `\\u${(`0000${chr.charCodeAt(0).toString(16)}`).substr(-4)}`) : undefined;
}

/**
 * Decode escaped Non ASCII characters.
 * @param value The value to decode.
 */
function decodeNonASCII(value: string): string {
    return value ? value.replace(/\\u([\d\w]{4})/gi, (match, grp) => String.fromCharCode(parseInt(grp, 16))) : undefined;
}

/**
 * Log message as banner text.
 * @param message The message to log.
 */
function logBanner(message: string): void {
    console.log(chalk.green(message));
}

/**
 * Log message as info text.
 * @param message The message to log.
 */
function logInfo(message: string): void {
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
    console.log(chalk.green(message));
}

/**
 * Log message as progress text.
 * @param message The message to log.
 */
function logProgress(message: string): void {
    console.error(chalk.yellow(`\n${message}`));
}
