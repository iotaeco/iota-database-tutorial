"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const ccurl = require("ccurl.interface.js");
const chalk_1 = require("chalk");
const fs = require("fs");
const IOTA = require("iota.lib.js");
const minimist = require("minimist");
const os = require("os");
const path = require("path");
const util = require("util");
const iotaHelper_1 = require("./helpers/iotaHelper");
/**
 * Create the iota instance.
 */
const iota = new IOTA({
    provider: "http://nodes.iota.fm:80"
});
attachCcurl(iota);
const configFile = "./data/db-config.json";
/**
 * Process the command line options.
 */
async function tutorial() {
    logBanner(`IOTA Database Tutorial`);
    logBanner(`======================`);
    logBanner(``);
    const argv = minimist(process.argv.slice(2));
    if (argv._.indexOf("init") >= 0) {
        await init(argv.seed, argv.tables);
    }
    else if (argv._.indexOf("index") >= 0) {
        await index(argv.table);
    }
    else if (argv._.indexOf("create") >= 0) {
        await createOrUpdateItem(argv.table, argv.data, undefined, argv.tag);
    }
    else if (argv._.indexOf("update") >= 0) {
        await createOrUpdateItem(argv.table, argv.data, argv.id, argv.tag);
    }
    else if (argv._.indexOf("read") >= 0) {
        await readItem(argv.table, argv.ids);
    }
    else if (argv._.indexOf("delete") >= 0) {
        await deleteItem(argv.table, argv.id);
    }
    else {
        throw new Error(`Please specify one of the following commands [init].`);
    }
}
/**
 * Initialise the database.
 * @param seed The seed to create the addresses from.
 * @param tables The name of the tables to create.
 * @returns The configuration object.
 */
async function init(seed, tables) {
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
        const config = {};
        const addresses = await iotaHelper_1.IotaHelper.getNewAddressAsync(iota, seed, {
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
    }
    catch (err) {
        throw new Error(`ERROR Unable to initialise database:\n\n${err.stack}`);
    }
}
/**
 * Retrieve the index for the database table from the tangle.
 * @param table The name of the table to retreive the index for.
 * @returns The table index hashes and previous index address.
 */
async function index(table) {
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
        }
        else {
            logSuccess("No index.");
        }
        return loadedIndex;
    }
    catch (err) {
        throw new Error(`ERROR Unable to load database table index:\n\n${err.stack}`);
    }
}
/**
 * Read items from the tangle database.
 * @param table The table to read the items from.
 * @param ids The ids of the items to read, optional reads all if not supplied.
 * @returns The object read from the database table.
 */
async function readItem(table, ids) {
    try {
        logInfo(`command: read`);
        if (!table || table.length === 0) {
            throw new Error(`ERROR table is not valid: ${table}`);
        }
        const config = await readConfigFile();
        if (!config[table]) {
            throw new Error(`ERROR table '${table}' does not exits in db-config.json`);
        }
        let loadedIndex;
        if (ids) {
            loadedIndex = { bundles: ids.split(","), lastIdx: "" };
        }
        else {
            loadedIndex = await loadIndex(config[table].currentIndex);
        }
        logProgress(`Reading items from Tangle`);
        const txObjects = await iotaHelper_1.IotaHelper.findTransactionObjectsAsync(iota, { bundles: loadedIndex.bundles });
        const objs = iotaHelper_1.IotaHelper.extractBundles(iota, txObjects);
        objs.forEach(obj => {
            logInfo(JSON.stringify(obj, undefined, "\t"));
        });
        return objs;
    }
    catch (err) {
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
async function createOrUpdateItem(table, data, id, tag = "") {
    try {
        logInfo(`command: ${id ? "update" : "create"}`);
        const finalTag = ((tag || "") + "9".repeat(27)).substr(0, 27);
        if (!table || table.length === 0) {
            throw new Error(`ERROR table is not valid: ${table}`);
        }
        if (!data || data.length === 0) {
            throw new Error(`ERROR data is not valid: ${data}`);
        }
        if (!iota.valid.isTrytes(tag, 27)) {
            throw new Error(`ERROR tag is not valid: ${tag}`);
        }
        const config = await readConfigFile();
        if (!config[table]) {
            throw new Error(`ERROR table '${table}' does not exits in db-config.json`);
        }
        logProgress(`Reading ${data}`);
        const jsonFile = await util.promisify(fs.readFile)(data);
        const ascii = iotaHelper_1.IotaHelper.encodeNonASCII(jsonFile.toString());
        logProgress(`Adding Data to Tangle`);
        logProgress(`Performing Proof of Work`);
        const txObjects = await iotaHelper_1.IotaHelper.sendTransferAsync(iota, "", 1, 15, [
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
    }
    catch (err) {
        throw new Error(`ERROR Unable to ${id ? "update" : "add"} item to the database:\n\n${err.stack}`);
    }
}
/**
 * Delete an item from the database table.
 * @param table The table to delete the item from.
 * @param id The id of the item to delete.
 */
async function deleteItem(table, id) {
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
        }
        else {
            logSuccess(`Item ${id} is not in the current index.`);
        }
    }
    catch (err) {
        throw new Error(`ERROR Unable to remove item from the database:\n\n${err.stack}`);
    }
}
/**
 * Load the table index from the tangle.
 * @param tableIndexHash The hash of the table index to load.
 * @returns The table index.
 */
async function loadIndex(tableIndexHash) {
    logProgress(`Loading Index from the Tangle`);
    if (!tableIndexHash || tableIndexHash.length === 0) {
        return {
            bundles: [],
            lastIdx: "9".repeat(81)
        };
    }
    else {
        const txObjects = await iotaHelper_1.IotaHelper.findTransactionObjectsAsync(iota, { bundles: [tableIndexHash] });
        const indexes = iotaHelper_1.IotaHelper.extractBundles(iota, txObjects);
        if (indexes && indexes.length > 0) {
            indexes[0].bundles = indexes[0].bundles || [];
            return indexes[0];
        }
        else {
            return {
                bundles: [],
                lastIdx: "9".repeat(81)
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
async function saveIndex(indexAddress, saveIdx, currentIndex) {
    logProgress(`Saving Index to the Tangle`);
    saveIdx.lastIdx = currentIndex || "9".repeat(81);
    logProgress(`Performing Proof of Work`);
    const txObjects = await iotaHelper_1.IotaHelper.sendTransferAsync(iota, "", 1, 15, [
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
async function writeConfigFile(config) {
    logProgress(`Writing db-config.json`);
    await util.promisify(fs.writeFile)(configFile, JSON.stringify(config, undefined, "\t"));
}
/**
 * Read the configuration from a file.
 * @returns The configuration.
 */
async function readConfigFile() {
    logProgress(`Reading db-config.json`);
    const file = await util.promisify(fs.readFile)(configFile);
    return JSON.parse(file.toString());
}
/**
 * Log message as banner text.
 * @param message The message to log.
 */
function logBanner(message) {
    // tslint:disable-next-line:no-console
    console.log(chalk_1.default.green(message));
}
/**
 * Log message as info text.
 * @param message The message to log.
 */
function logInfo(message) {
    // tslint:disable-next-line:no-console
    console.info(chalk_1.default.cyan(message));
}
/**
 * Log message as error text.
 * @param message The message to log.
 */
function logError(message) {
    console.error(chalk_1.default.red(message));
}
/**
 * Log message as success text.
 * @param message The message to log.
 */
function logSuccess(message) {
    // tslint:disable-next-line:no-console
    console.log(chalk_1.default.green(message));
}
/**
 * Log message as progress text.
 * @param message The message to log.
 */
function logProgress(message) {
    console.error(chalk_1.default.yellow(`\n${message}`));
}
/**
 * Attach the ccurl proof of work algorithm.
 * @param iotaInstance The iota lib object.
 */
function attachCcurl(iotaInstance) {
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
function ccurlAttachToTangle(trunkTransaction, branchTransaction, minWeightMagnitude, trytes, callback) {
    const ccurlPath = path.join(__dirname, "../", "binaries", os.platform());
    ccurl(trunkTransaction, branchTransaction, minWeightMagnitude, trytes, ccurlPath, callback);
}
tutorial()
    .then(() => logInfo("Success"))
    .catch(logError);
