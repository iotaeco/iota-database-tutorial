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
        if (!iota.valid.isTrytes(finalTag, 27)) {
            throw new Error(`ERROR tag is not valid: ${finalTag}`);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidHV0b3JpYWwuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvdHV0b3JpYWwudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBLDRDQUE0QztBQUM1QyxpQ0FBMEI7QUFDMUIseUJBQXlCO0FBQ3pCLG9DQUFvQztBQUNwQyxxQ0FBcUM7QUFDckMseUJBQXlCO0FBQ3pCLDZCQUE2QjtBQUM3Qiw2QkFBNkI7QUFDN0IscURBQWtEO0FBSWxEOztHQUVHO0FBQ0gsTUFBTSxJQUFJLEdBQUcsSUFBSSxJQUFJLENBQUM7SUFDbEIsUUFBUSxFQUFFLHlCQUF5QjtDQUN0QyxDQUFDLENBQUM7QUFFSCxXQUFXLENBQUMsSUFBSSxDQUFDLENBQUM7QUFFbEIsTUFBTSxVQUFVLEdBQUcsdUJBQXVCLENBQUM7QUFFM0M7O0dBRUc7QUFDSCxLQUFLO0lBQ0QsU0FBUyxDQUFDLHdCQUF3QixDQUFDLENBQUM7SUFDcEMsU0FBUyxDQUFDLHdCQUF3QixDQUFDLENBQUM7SUFDcEMsU0FBUyxDQUFDLEVBQUUsQ0FBQyxDQUFDO0lBRWQsTUFBTSxJQUFJLEdBQUcsUUFBUSxDQVVmLE9BQU8sQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFFN0IsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUM5QixNQUFNLElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztJQUN2QyxDQUFDO0lBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDdEMsTUFBTSxLQUFLLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDO0lBQzVCLENBQUM7SUFBQyxJQUFJLENBQUMs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