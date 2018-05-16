Object.defineProperty(exports, "__esModule", { value: true });
const ccurl = require("ccurl.interface.js");
const chalk_1 = require("chalk");
const crypto = require("crypto");
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
const pubKeyFile = "./data/pub.key";
const privKeyFile = "./data/priv.key";
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
        for (let i = 0; i < objs.length; i++) {
            const verified = await verifyData(objs[i]);
            if (!verified) {
                throw new Error("ERROR Signature on item is invalid");
            }
            logInfo(JSON.stringify(objs[i], undefined, "\t"));
        }
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
        const obj = JSON.parse(jsonFile.toString());
        obj.sig = await signData(obj);
        const ascii = iotaHelper_1.IotaHelper.encodeNonASCII(JSON.stringify(obj));
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
            lastIdx: undefined
        };
    }
    else {
        const txObjects = await iotaHelper_1.IotaHelper.findTransactionObjectsAsync(iota, { bundles: [tableIndexHash] });
        const indexes = iotaHelper_1.IotaHelper.extractBundles(iota, txObjects);
        if (indexes && indexes.length > 0) {
            const currentIndex = indexes[0];
            const verified = await verifyData(currentIndex);
            if (!verified) {
                throw (new Error("ERROR Signature on index is invalid"));
            }
            currentIndex.bundles = currentIndex.bundles || [];
            return currentIndex;
        }
        else {
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
async function saveIndex(indexAddress, saveIdx, currentIndex) {
    logProgress(`Saving Index to the Tangle`);
    saveIdx.lastIdx = currentIndex;
    saveIdx.sig = await signData(saveIdx);
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
 * Sign the data.
 * @param data The data to sign.
 * @returns Signed data.
 */
async function signData(data) {
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
async function verifyData(data) {
    if (!data.sig) {
        return false;
    }
    else {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidHV0b3JpYWwuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvdHV0b3JpYWwudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBLDRDQUE0QztBQUM1QyxpQ0FBMEI7QUFDMUIsaUNBQWlDO0FBQ2pDLHlCQUF5QjtBQUN6QixvQ0FBb0M7QUFDcEMscUNBQXFDO0FBQ3JDLHlCQUF5QjtBQUN6Qiw2QkFBNkI7QUFDN0IsNkJBQTZCO0FBQzdCLHFEQUFrRDtBQUlsRDs7R0FFRztBQUNILE1BQU0sSUFBSSxHQUFHLElBQUksSUFBSSxDQUFDO0lBQ2xCLFFBQVEsRUFBRSx5QkFBeUI7Q0FDdEMsQ0FBQyxDQUFDO0FBRUgsV0FBVyxDQUFDLElBQUksQ0FBQyxDQUFDO0FBRWxCLE1BQU0sVUFBVSxHQUFHLHVCQUF1QixDQUFDO0FBQzNDLE1BQU0sVUFBVSxHQUFHLGdCQUFnQixDQUFDO0FBQ3BDLE1BQU0sV0FBVyxHQUFHLGlCQUFpQixDQUFDO0FBRXRDOztHQUVHO0FBQ0gsS0FBSztJQUNELFNBQVMsQ0FBQyx3QkFBd0IsQ0FBQyxDQUFDO0lBQ3BDLFNBQVMsQ0FBQyx3QkFBd0IsQ0FBQyxDQUFDO0lBQ3BDLFNBQVMsQ0FBQyxFQUFFLENBQUMsQ0FBQztJQUVkLE1BQU0sSUFBSSxHQUFHLFFBQVEsQ0FVZixPQUFPLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBRTdCLElBQUksSUFBSSxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxFQUFFO1FBQzdCLE1BQU0sSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO0tBQ3RDO1NBQU0sSUFBSSxJQUFJLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLEVBQUU7UUFDckMsTUFBTSxLQUFLLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDO0tBQzNCO1NBQU0sSUFBSSxJQUFJLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLEVBQUU7UUFDdEMsTUFBTSxrQkFBa0IsQ0FBQyxJQUFJLENBQUMsS0FBSyxFQUFFLElBQUksQ0FBQyxJQUFJLEVBQUUsU0FBUyxFQUFFLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztLQUN4RTtTQUFNLElBQUksSUFBSSxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxFQUFFO1FBQ3RDLE1BQU0sa0JBQWtCLENBQUMsSUFBSSxDQUFDLEtBQUssRUFBRSxJQUFJLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxFQUFFLEVBQUUsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDO0tBQ3RFO1NBQU0sSUFBSSxJQUFJLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLEVBQUU7UUFDcEMsTUFBTSxRQUFRLENBQUMsSUFBSSxDQUFDLEtBQUssRUFBRSxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7S0FDeEM7U0FBTSxJQUFJLElBQUksQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsRUFBRTtRQUN0QyxNQUFNLFVBQVUsQ0FBQyxJQUFJLENBQUMsS0FBSyxFQUFFLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQztLQUN6QztTQUFNO1FBQ0gsTUFBTSxJQUFJLEtBQUssQ0FBQyxzREFBc0QsQ0FBQyxDQUFDO0tBQzNFO0FBQ0wsQ0FBQztBQUVEOzs7OztHQUtHO0FBQ0gsS0FBSyxlQUFlLElBQVksRUFBRSxNQUFjO0lBQzVDLElBQUk7UUFDQSxPQUFPLENBQUMscUJBQXFCLENBQUMsQ0FBQztRQUUvQixJQUFJLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsSUFBSSxFQUFFLEVBQUUsQ0FBQyxFQUFFO1lBQ2hDLE1BQU0sSUFBSSxLQUFLLENBQUMsNEJBQTRCLElBQUksRUFBRSxDQUFDLENBQUM7U0FDdkQ7UUFFRCxJQUFJLENBQUMsTUFBTSxJQUFJLE1BQU0sQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUFFO1lBQ2hDLE1BQU0sSUFBSSxLQUFLLENBQUMsOEJBQThCLE1BQU0sRUFBRSxDQUFDLENBQUM7U0FDM0Q7UUFFRCxNQUFNLFVBQVUsR0FBRyxNQUFNLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDO1FBRXhELE9BQU8sQ0FBQyxTQUFTLElBQUksRUFBRSxDQUFDLENBQUM7UUFDekIsT0FBTyxDQUFDLFdBQVcsVUFBVSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUM7UUFFNUMsV0FBVyxDQUFDLHNCQUFzQixDQUFDLENBQUM7UUFFcEMsTUFBTSxNQUFNLEdBQWtCLEVBQUUsQ0FBQztRQUVqQyxNQUFNLFNBQVMsR0FBRyxNQUFNLHVCQUFVLENBQUMsa0JBQWtCLENBQUMsSUFBSSxFQUFFLElBQUksRUFBRTtZQUM5RCxLQUFLLEVBQUUsVUFBVSxDQUFDLE1BQU0sR0FBRyxDQUFDO1lBQzVCLFFBQVEsRUFBRSxDQUFDO1NBQ2QsQ0FBQyxDQUFDO1FBRUgsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLFVBQVUsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLEVBQUU7WUFDeEMsTUFBTSxTQUFTLEdBQUcsVUFBVSxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBRWhDLE1BQU0sQ0FBQyxTQUFTLENBQUMsR0FBRztnQkFDaEIsWUFBWSxFQUFFLFNBQVMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDO2dCQUM5QixXQUFXLEVBQUUsU0FBUyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQztnQkFDbkMsWUFBWSxFQUFFLEVBQUU7YUFDbkIsQ0FBQztZQUVGLE9BQU8sQ0FBQyxLQUFLLFNBQVMsbUJBQW1CLE1BQU0sQ0FBQyxTQUFTLENBQUMsQ0FBQyxZQUFZLEVBQUUsQ0FBQyxDQUFDO1lBQzNFLE9BQU8sQ0FBQyxLQUFLLFNBQVMsa0JBQWtCLE1BQU0sQ0FBQyxTQUFTLENBQUMsQ0FBQyxXQUFXLEVBQUUsQ0FBQyxDQUFDO1NBQzVFO1FBRUQsTUFBTSxlQUFlLENBQUMsTUFBTSxDQUFDLENBQUM7UUFFOUIsVUFBVSxDQUFDLHVEQUF1RCxDQUFDLENBQUM7UUFFcEUsT0FBTyxNQUFNLENBQUM7S0FDakI7SUFBQyxPQUFPLEdBQUcsRUFBRTtRQUNWLE1BQU0sSUFBSSxLQUFLLENBQUMsMkNBQTJDLEdBQUcsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxDQUFDO0tBQzNFO0FBQ0wsQ0FBQztBQUVEOzs7O0dBSUc7QUFDSCxLQUFLLGdCQUFnQixLQUFhO0lBQzlCLElBQUk7UUFDQSxPQUFPLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztRQUUxQixJQUFJLENBQUMsS0FBSyxJQUFJLEtBQUssQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUFFO1lBQzlCLE1BQU0sSUFBSSxLQUFLLENBQUMsNkJBQTZCLEtBQUssRUFBRSxDQUFDLENBQUM7U0FDekQ7UUFFRCxNQUFNLE1BQU0sR0FBRyxNQUFNLGNBQWMsRUFBRSxDQUFDO1FBRXRDLElBQUksQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLEVBQUU7WUFDaEIsTUFBTSxJQUFJLEtBQUssQ0FBQyxnQkFBZ0IsS0FBSyxvQ0FBb0MsQ0FBQyxDQUFDO1NBQzlFO1FBRUQsTUFBTSxXQUFXLEdBQUcsTUFBTSxTQUFTLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDLFlBQVksQ0FBQyxDQUFDO1FBRWhFLElBQUksV0FBVyxDQUFDLE9BQU8sQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFO1lBQ2hDLFVBQVUsQ0FBQyxlQUFlLENBQUMsQ0FBQztZQUM1QixVQUFVLENBQUMsS0FBSyxXQUFXLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLENBQUM7U0FDdkQ7YUFBTTtZQUNILFVBQVUsQ0FBQyxXQUFXLENBQUMsQ0FBQztTQUMzQjtRQUVELE9BQU8sV0FBVyxDQUFDO0tBQ3RCO0lBQUMsT0FBTyxHQUFHLEVBQUU7UUFDVixNQUFNLElBQUksS0FBSyxDQUFDLGlEQUFpRCxHQUFHLENBQUMsS0FBSyxFQUFFLENBQUMsQ0FBQztLQUNqRjtBQUNMLENBQUM7QUFFRDs7Ozs7R0FLRztBQUNILEtBQUssbUJBQW1CLEtBQWEsRUFBRSxHQUFZO0lBQy9DLElBQUk7UUFDQSxPQUFPLENBQUMsZUFBZSxDQUFDLENBQUM7UUFFekIsSUFBSSxDQUFDLEtBQUssSUFBSSxLQUFLLENBQUMsTUFBTSxLQUFLLENBQUMsRUFBRTtZQUM5QixNQUFNLElBQUksS0FBSyxDQUFDLDZCQUE2QixLQUFLLEVBQUUsQ0FBQyxDQUFDO1NBQ3pEO1FBRUQsTUFBTSxNQUFNLEdBQUcsTUFBTSxjQUFjLEVBQUUsQ0FBQztRQUV0QyxJQUFJLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxFQUFFO1lBQ2hCLE1BQU0sSUFBSSxLQUFLLENBQUMsZ0JBQWdCLEtBQUssb0NBQW9DLENBQUMsQ0FBQztTQUM5RTtRQUVELElBQUksV0FBNEIsQ0FBQztRQUNqQyxJQUFJLEdBQUcsRUFBRTtZQUNMLFdBQVcsR0FBRyxFQUFFLE9BQU8sRUFBRSxHQUFHLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxFQUFFLE9BQU8sRUFBRSxFQUFFLEVBQUUsQ0FBQztTQUMxRDthQUFNO1lBQ0gsV0FBVyxHQUFHLE1BQU0sU0FBUyxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQyxZQUFZLENBQUMsQ0FBQztTQUM3RDtRQUVELFdBQVcsQ0FBQywyQkFBMkIsQ0FBQyxDQUFDO1FBRXpDLE1BQU0sU0FBUyxHQUFHLE1BQU0sdUJBQVUsQ0FBQywyQkFBMkIsQ0FBQyxJQUFJLEVBQUUsRUFBRSxPQUFPLEVBQUUsV0FBVyxDQUFDLE9BQU8sRUFBRSxDQUFDLENBQUM7UUFFdkcsTUFBTSxJQUFJLEdBQUcsdUJBQVUsQ0FBQyxjQUFjLENBQUMsSUFBSSxFQUFFLFNBQVMsQ0FBQyxDQUFDO1FBRXhELEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxJQUFJLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxFQUFFO1lBQ2xDLE1BQU0sUUFBUSxHQUFHLE1BQU0sVUFBVSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQzNDLElBQUksQ0FBQyxRQUFRLEVBQUU7Z0JBQ1gsTUFBTSxJQUFJLEtBQUssQ0FBQyxvQ0FBb0MsQ0FBQyxDQUFDO2FBQ3pEO1lBQ0QsT0FBTyxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLFNBQVMsRUFBRSxJQUFJLENBQUMsQ0FBQyxDQUFDO1NBQ3JEO1FBRUQsT0FBTyxJQUFJLENBQUM7S0FDZjtJQUFDLE9BQU8sR0FBRyxFQUFFO1FBQ1YsTUFBTSxJQUFJLEtBQUssQ0FBQyxpQ0FBaUMsR0FBRyxDQUFDLEtBQUssRUFBRSxDQUFDLENBQUM7S0FDakU7QUFDTCxDQUFDO0FBRUQ7Ozs7Ozs7R0FPRztBQUNILEtBQUssNkJBQTZCLEtBQWEsRUFBRSxJQUFZLEVBQUUsRUFBVyxFQUFFLE1BQWMsRUFBRTtJQUN4RixJQUFJO1FBQ0EsT0FBTyxDQUFDLFlBQVksRUFBRSxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUM7UUFFaEQsTUFBTSxRQUFRLEdBQUcsQ0FBQyxDQUFDLEdBQUcsSUFBSSxFQUFFLENBQUMsR0FBRyxHQUFHLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUU5RCxJQUFJLENBQUMsS0FBSyxJQUFJLEtBQUssQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUFFO1lBQzlCLE1BQU0sSUFBSSxLQUFLLENBQUMsNkJBQTZCLEtBQUssRUFBRSxDQUFDLENBQUM7U0FDekQ7UUFFRCxJQUFJLENBQUMsSUFBSSxJQUFJLElBQUksQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUFFO1lBQzVCLE1BQU0sSUFBSSxLQUFLLENBQUMsNEJBQTRCLElBQUksRUFBRSxDQUFDLENBQUM7U0FDdkQ7UUFFRCxJQUFJLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsUUFBUSxFQUFFLEVBQUUsQ0FBQyxFQUFFO1lBQ3BDLE1BQU0sSUFBSSxLQUFLLENBQUMsMkJBQTJCLFFBQVEsRUFBRSxDQUFDLENBQUM7U0FDMUQ7UUFFRCxNQUFNLE1BQU0sR0FBRyxNQUFNLGNBQWMsRUFBRSxDQUFDO1FBRXRDLElBQUksQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLEVBQUU7WUFDaEIsTUFBTSxJQUFJLEtBQUssQ0FBQyxnQkFBZ0IsS0FBSyxvQ0FBb0MsQ0FBQyxDQUFDO1NBQzlFO1FBRUQsV0FBVyxDQUFDLFdBQVcsSUFBSSxFQUFFLENBQUMsQ0FBQztRQUUvQixNQUFNLFFBQVEsR0FBRyxNQUFNLElBQUksQ0FBQyxTQUFTLENBQUMsRUFBRSxDQUFDLFFBQVEsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDO1FBRXpELE1BQU0sR0FBRyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUM7UUFFNUMsR0FBRyxDQUFDLEdBQUcsR0FBRyxNQUFNLFFBQVEsQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUU5QixNQUFNLEtBQUssR0FBRyx1QkFBVSxDQUFDLGNBQWMsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7UUFFN0QsV0FBVyxDQUFDLHVCQUF1QixDQUFDLENBQUM7UUFFckMsV0FBVyxDQUFDLDBCQUEwQixDQUFDLENBQUM7UUFDeEMsTUFBTSxTQUFTLEdBQUcsTUFBTSx1QkFBVSxDQUFDLGlCQUFpQixDQUFDLElBQUksRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsRUFBRTtZQUNsRTtnQkFDSSxPQUFPLEVBQUUsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDLFdBQVc7Z0JBQ2xDLEtBQUssRUFBRSxDQUFDO2dCQUNSLE9BQU8sRUFBRSxJQUFJLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUM7Z0JBQ25DLEdBQUcsRUFBRSxRQUFRO2FBQ2hCO1NBQ0osQ0FBQyxDQUFDO1FBRUgsV0FBVyxDQUFDLHlCQUF5QixTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQztRQUU3RCxNQUFNLFdBQVcsR0FBRyxNQUFNLFNBQVMsQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUMsWUFBWSxDQUFDLENBQUM7UUFFaEUsSUFBSSxFQUFFLEVBQUU7WUFDSixNQUFNLEdBQUcsR0FBRyxXQUFXLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUM1QyxJQUFJLEdBQUcsSUFBSSxDQUFDLEVBQUU7Z0JBQ1YsV0FBVyxDQUFDLGtDQUFrQyxDQUFDLENBQUM7Z0JBQ2hELFdBQVcsQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLEdBQUcsRUFBRSxDQUFDLENBQUMsQ0FBQzthQUN0QztTQUNKO1FBRUQsV0FBVyxDQUFDLDhCQUE4QixDQUFDLENBQUM7UUFFNUMsV0FBVyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBRTlDLE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQyxZQUFZLEdBQUcsTUFBTSxTQUFTLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDLFlBQVksRUFBRSxXQUFXLEVBQUUsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDLFlBQVksQ0FBQyxDQUFDO1FBRWxILE1BQU0sZUFBZSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBRTlCLFVBQVUsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxPQUFPLDJFQUEyRSxDQUFDLENBQUM7UUFDeEgsVUFBVSxDQUFDLGlEQUFpRCxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FBQztRQUNqRixVQUFVLENBQUMsMENBQTBDLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDO1FBQzVFLFVBQVUsQ0FBQyxvQ0FBb0MsQ0FBQyxDQUFDO1FBQ2pELFVBQVUsQ0FBQyxrQ0FBa0MsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDLFlBQVksRUFBRSxDQUFDLENBQUM7UUFFM0UsT0FBTyxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDO0tBQzlCO0lBQUMsT0FBTyxHQUFHLEVBQUU7UUFDVixNQUFNLElBQUksS0FBSyxDQUFDLG1CQUFtQixFQUFFLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsS0FBSyw2QkFBNkIsR0FBRyxDQUFDLEtBQUssRUFBRSxDQUFDLENBQUM7S0FDckc7QUFDTCxDQUFDO0FBRUQ7Ozs7R0FJRztBQUNILEtBQUsscUJBQXFCLEtBQWEsRUFBRSxFQUFVO0lBQy9DLElBQUk7UUFDQSxPQUFPLENBQUMsaUJBQWlCLENBQUMsQ0FBQztRQUUzQixJQUFJLENBQUMsS0FBSyxJQUFJLEtBQUssQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUFFO1lBQzlCLE1BQU0sSUFBSSxLQUFLLENBQUMsNkJBQTZCLEtBQUssRUFBRSxDQUFDLENBQUM7U0FDekQ7UUFFRCxJQUFJLENBQUMsRUFBRSxJQUFJLEVBQUUsQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUFFO1lBQ3hCLE1BQU0sSUFBSSxLQUFLLENBQUMsMEJBQTBCLEVBQUUsRUFBRSxDQUFDLENBQUM7U0FDbkQ7UUFFRCxNQUFNLE1BQU0sR0FBRyxNQUFNLGNBQWMsRUFBRSxDQUFDO1FBRXRDLElBQUksQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLEVBQUU7WUFDaEIsTUFBTSxJQUFJLEtBQUssQ0FBQyxnQkFBZ0IsS0FBSyxvQ0FBb0MsQ0FBQyxDQUFDO1NBQzlFO1FBRUQsTUFBTSxXQUFXLEdBQUcsTUFBTSxTQUFTLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDLFlBQVksQ0FBQyxDQUFDO1FBRWhFLE1BQU0sR0FBRyxHQUFHLFdBQVcsQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQzVDLElBQUksR0FBRyxJQUFJLENBQUMsRUFBRTtZQUNWLFdBQVcsQ0FBQyw4QkFBOEIsQ0FBQyxDQUFDO1lBRTVDLFdBQVcsQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLEdBQUcsRUFBRSxDQUFDLENBQUMsQ0FBQztZQUVuQyxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUMsWUFBWSxHQUFHLE1BQU0sU0FBUyxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQyxZQUFZLEVBQUUsV0FBVyxFQUFFLE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQyxZQUFZLENBQUMsQ0FBQztZQUVsSCxNQUFNLGVBQWUsQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUU5QixVQUFVLENBQUMsZ0JBQWdCLEVBQUUsR0FBRyxDQUFDLENBQUM7U0FDckM7YUFBTTtZQUNILFVBQVUsQ0FBQyxRQUFRLEVBQUUsK0JBQStCLENBQUMsQ0FBQztTQUN6RDtLQUNKO0lBQUMsT0FBTyxHQUFHLEVBQUU7UUFDVixNQUFNLElBQUksS0FBSyxDQUFDLHFEQUFxRCxHQUFHLENBQUMsS0FBSyxFQUFFLENBQUMsQ0FBQztLQUNyRjtBQUNMLENBQUM7QUFFRDs7OztHQUlHO0FBQ0gsS0FBSyxvQkFBb0IsY0FBc0I7SUFDM0MsV0FBVyxDQUFDLCtCQUErQixDQUFDLENBQUM7SUFFN0MsSUFBSSxDQUFDLGNBQWMsSUFBSSxjQUFjLENBQUMsTUFBTSxLQUFLLENBQUMsRUFBRTtRQUNoRCxPQUFPO1lBQ0gsT0FBTyxFQUFFLEVBQUU7WUFDWCxPQUFPLEVBQUUsU0FBUztTQUNyQixDQUFDO0tBQ0w7U0FBTTtRQUNILE1BQU0sU0FBUyxHQUFHLE1BQU0sdUJBQVUsQ0FBQywyQkFBMkIsQ0FDMUQsSUFBSSxFQUNKLEVBQUUsT0FBTyxFQUFFLENBQUMsY0FBYyxDQUFDLEVBQUUsQ0FDaEMsQ0FBQztRQUVGLE1BQU0sT0FBTyxHQUFHLHVCQUFVLENBQUMsY0FBYyxDQUFrQixJQUFJLEVBQUUsU0FBUyxDQUFDLENBQUM7UUFFNUUsSUFBSSxPQUFPLElBQUksT0FBTyxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUU7WUFDL0IsTUFBTSxZQUFZLEdBQUcsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ2hDLE1BQU0sUUFBUSxHQUFHLE1BQU0sVUFBVSxDQUFDLFlBQVksQ0FBQyxDQUFDO1lBRWhELElBQUksQ0FBQyxRQUFRLEVBQUU7Z0JBQ1gsTUFBSyxDQUFDLElBQUksS0FBSyxDQUFDLHFDQUFxQyxDQUFDLENBQUMsQ0FBQzthQUMzRDtZQUVELFlBQVksQ0FBQyxPQUFPLEdBQUcsWUFBWSxDQUFDLE9BQU8sSUFBSSxFQUFFLENBQUM7WUFDbEQsT0FBTyxZQUFZLENBQUM7U0FDdkI7YUFBTTtZQUNILE9BQU87Z0JBQ0gsT0FBTyxFQUFFLEVBQUU7Z0JBQ1gsT0FBTyxFQUFFLFNBQVM7YUFDckIsQ0FBQztTQUNMO0tBQ0o7QUFDTCxDQUFDO0FBRUQ7Ozs7OztHQU1HO0FBQ0gsS0FBSyxvQkFBb0IsWUFBb0IsRUFBRSxPQUF3QixFQUFFLFlBQW9CO0lBQ3pGLFdBQVcsQ0FBQyw0QkFBNEIsQ0FBQyxDQUFDO0lBRTFDLE9BQU8sQ0FBQyxPQUFPLEdBQUcsWUFBWSxDQUFDO0lBQy9CLE9BQU8sQ0FBQyxHQUFHLEdBQUcsTUFBTSxRQUFRLENBQUMsT0FBTyxDQUFDLENBQUM7SUFFdEMsV0FBVyxDQUFDLDBCQUEwQixDQUFDLENBQUM7SUFDeEMsTUFBTSxTQUFTLEdBQUcsTUFBTSx1QkFBVSxDQUFDLGlCQUFpQixDQUFDLElBQUksRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsRUFBRTtRQUNsRTtZQUNJLE9BQU8sRUFBRSxZQUFZO1lBQ3JCLEtBQUssRUFBRSxDQUFDO1lBQ1IsT0FBTyxFQUFFLElBQUksQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsT0FBTyxDQUFDLENBQUM7WUFDckQsR0FBRyxFQUFFLDZCQUE2QjtTQUNyQztLQUNKLENBQUMsQ0FBQztJQUVILE9BQU8sU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQztBQUMvQixDQUFDO0FBRUQ7OztHQUdHO0FBQ0gsS0FBSywwQkFBMEIsTUFBcUI7SUFDaEQsV0FBVyxDQUFDLHdCQUF3QixDQUFDLENBQUM7SUFDdEMsTUFBTSxJQUFJLENBQUMsU0FBUyxDQUFDLEVBQUUsQ0FBQyxTQUFTLENBQUMsQ0FBQyxVQUFVLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxNQUFNLEVBQUUsU0FBUyxFQUFFLElBQUksQ0FBQyxDQUFDLENBQUM7QUFDNUYsQ0FBQztBQUVEOzs7R0FHRztBQUNILEtBQUs7SUFDRCxXQUFXLENBQUMsd0JBQXdCLENBQUMsQ0FBQztJQUN0QyxNQUFNLElBQUksR0FBRyxNQUFNLElBQUksQ0FBQyxTQUFTLENBQUMsRUFBRSxDQUFDLFFBQVEsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxDQUFDO0lBQzNELE9BQU8sSUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQztBQUN2QyxDQUFDO0FBRUQ7Ozs7R0FJRztBQUNILEtBQUssbUJBQW1CLElBQVM7SUFDN0IsT0FBTyxJQUFJLENBQUMsR0FBRyxDQUFDO0lBQ2hCLE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLENBQUM7SUFFbEMsTUFBTSxJQUFJLEdBQUcsTUFBTSxJQUFJLENBQUMsU0FBUyxDQUFDLEVBQUUsQ0FBQyxRQUFRLENBQUMsQ0FBQyxXQUFXLENBQUMsQ0FBQztJQUU1RCxNQUFNLE1BQU0sR0FBRyxNQUFNLENBQUMsVUFBVSxDQUFDLFlBQVksQ0FBQyxDQUFDO0lBQy9DLE1BQU0sQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDcEIsT0FBTyxNQUFNLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxRQUFRLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztBQUMvQyxDQUFDO0FBRUQ7Ozs7R0FJRztBQUNILEtBQUsscUJBQXFCLElBQVM7SUFDL0IsSUFBSSxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUU7UUFDWCxPQUFPLEtBQUssQ0FBQztLQUNoQjtTQUFNO1FBQ0gsTUFBTSxTQUFTLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQztRQUMzQixPQUFPLElBQUksQ0FBQyxHQUFHLENBQUM7UUFDaEIsTUFBTSxJQUFJLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUVsQyxNQUFNLFNBQVMsR0FBRyxNQUFNLElBQUksQ0FBQyxTQUFTLENBQUMsRUFBRSxDQUFDLFFBQVEsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBRWhFLE1BQU0sUUFBUSxHQUFHLE1BQU0sQ0FBQyxZQUFZLENBQUMsWUFBWSxDQUFDLENBQUM7UUFDbkQsUUFBUSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUN0QixPQUFPLFFBQVEsQ0FBQyxNQUFNLENBQUMsU0FBUyxDQUFDLFFBQVEsRUFBRSxFQUFFLFNBQVMsRUFBRSxLQUFLLENBQUMsQ0FBQztLQUNsRTtBQUNMLENBQUM7QUFFRDs7O0dBR0c7QUFDSCxtQkFBbUIsT0FBZTtJQUM5QixzQ0FBc0M7SUFDdEMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxlQUFLLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUM7QUFDdEMsQ0FBQztBQUVEOzs7R0FHRztBQUNILGlCQUFpQixPQUFlO0lBQzVCLHNDQUFzQztJQUN0QyxPQUFPLENBQUMsSUFBSSxDQUFDLGVBQUssQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQztBQUN0QyxDQUFDO0FBRUQ7OztHQUdHO0FBQ0gsa0JBQWtCLE9BQWU7SUFDN0IsT0FBTyxDQUFDLEtBQUssQ0FBQyxlQUFLLENBQUMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUM7QUFDdEMsQ0FBQztBQUVEOzs7R0FHRztBQUNILG9CQUFvQixPQUFlO0lBQy9CLHNDQUFzQztJQUN0QyxPQUFPLENBQUMsR0FBRyxDQUFDLGVBQUssQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQztBQUN0QyxDQUFDO0FBRUQ7OztHQUdHO0FBQ0gscUJBQXFCLE9BQWU7SUFDaEMsT0FBTyxDQUFDLEtBQUssQ0FBQyxlQUFLLENBQUMsTUFBTSxDQUFDLEtBQUssT0FBTyxFQUFFLENBQUMsQ0FBQyxDQUFDO0FBQ2hELENBQUM7QUFFRDs7O0dBR0c7QUFDSCxxQkFBcUIsWUFBa0I7SUFDbkMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxjQUFjLEdBQUcsbUJBQW1CLENBQUM7QUFDbEQsQ0FBQztBQUVEOzs7Ozs7O0dBT0c7QUFDSCw2QkFDSSxnQkFBd0IsRUFDeEIsaUJBQXlCLEVBQ3pCLGtCQUEwQixFQUMxQixNQUFnQixFQUNoQixRQUFnRDtJQUVoRCxNQUFNLFNBQVMsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRSxLQUFLLEVBQUUsVUFBVSxFQUFFLEVBQUUsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDO0lBQ3pFLEtBQUssQ0FDRCxnQkFBZ0IsRUFDaEIsaUJBQWlCLEVBQ2pCLGtCQUFrQixFQUNsQixNQUFNLEVBQ04sU0FBUyxFQUNULFFBQVEsQ0FDWCxDQUFDO0FBQ04sQ0FBQztBQUVELFFBQVEsRUFBRTtLQUNMLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLENBQUM7S0FDOUIsS0FBSyxDQUFDLFFBQVEsQ0FBQyxDQUFDIn0=