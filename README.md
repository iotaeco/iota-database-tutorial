# IOTA Database Tutorial

The code in this repository is to supplement the following article [https://medium.com/@iota.eco/iota-ecosytem-fund-tracker-storage-dd8c90b7c4ea](https://medium.com/@iota.eco/iota-ecosytem-fund-tracker-storage-dd8c90b7c4ea)

This tutorial is designed to run as a command line tool on NodeJS, there is no UI for it.

## Installation

```shell
npm install
```

## Build

The code is written in TypeScript so you must build the code. If you are more familiar with plain JavaScript the output of the TypeScript compilation is ES6 code.

```shell
tsc
```

## Creating a Database

The first step in using the tangle to store your objects is to create the database configuration. This will generate addresses to store both the index and data for each table name you specify.

We do this by running the following command:

```shell
node ./dist/tutorial init --seed=999...999 --tables=tableName1,tableName2
```

The parameters are as follows:
* **seed** - A new random seed that you want to use to generate addresses.
* **tables** - A comma separated list of the names of the tables you want in the database.

### Examples

```shell
node ./dist/tutorial init --seed=CWLPJMQYVDJGCVTY9KLMXE9SOQKLUHOCPZIRFSMW9FLMHM9YGA9G9OOJOLVYIAFUOJDVQ9EADWFXYROSN --tables=people,places
```

Would result in the file db-config.json being written with the following data:

```json
{
    "people": {
        "indexAddress": "MZRIIAVM9ETXTLUHHKM99XK9RAEKGDGXHU9LDX9FBQYZFCJJBDRREPTXIEMLQORTC9DRKSZMTESSXZN9D",
        "dataAddress": "ALHBP9RQVLMMMEFSKRGBSOVHF9DRRCLKEJQMZFAHZIFCEDRPMYGINKZPZTISMKUHKFRNPDTBNIHYUZKXX"
    },
    "places": {
        "indexAddress": "HPHDEYOEXBQEWGBNFRUVRHAULTYRTUPGEKOLHQWOF9GRORWNRTT9LEQWATTZCZO9RSBAJXYEAVEUCZUAA",
        "dataAddress": "9GGUAZWKOWCHVKSB9ZAHZOALXWRPIJBUAQPVVTMSIOXSABKCWS9JMWDKDUGVGOYOSKLKUN9TXCGNHAWMA"
    }
}
```

## Creating Data

Now that we have generated our configuration we can add some data to the tangle. This operation will add data to the table we specify using a json file as the source for the data. The json size is not limited to the signatureMessageFragment size of a transaction, as it will automatically split across multiple transactions.

We do this by running the following command:

```shell
node ./dist/tutorial create --table=tableName1 --data=path --tag=tag
```

The parameters are as follows:

* **table** - The table that you want to create the data in.
* **data** - The path to a .json file of data that you want to add.
* **tag** - A tag to include on the tangle in trytes, max length 27.


### Examples

```shell
node ./dist/tutorial create --table=people --data=./data/object1.json

node ./dist/tutorial create --table=people --data=./data/object2.json --tag=MYDATA
```

This will add two objects to the database and update the index accordingly. You will be presented with links to the new objects on the tangle which you can open in your browser.

```shell
Item added, you should be able to see the data on the tangle at the following link.
        https://thetangle.org/transaction/YTISGNVMOEYACREOYGJQAIYJQDINFLMDUIRBUQLXOYFCZ9LMNPMSSULBMNMVW9KXUUCJAIYHFOMJ99999

The new index is available here.
        https://thetangle.org/bundle/LI9YSNCEAYZDKSVXHIBYKLK99OVQOIEPVOCAEHFLPPBLTELHYGUEJHHPPJVZIHOCQAPJVDSKGFKOLWCVW
```

## Getting The Index

Given that we now have data in our database we can retreive the index of all the items currently in our tables.

We do this by running the following command:

```shell
node ./dist/tutorial index --table=tableName1
```

The parameters are as follows:

* **table** - The table that you want to get the index for.

### Examples

```shell
node ./dist/tutorial index --table=people
```

You should get a response similar to the following.

```shell
Index hashes:
WCTH9JEBYVKDXDEJBOVXFKWJLK9AHZJXWDIFVCNIBCTFIHKWVQFGQCQLLJGXZ9EWDTYNRGXFBGSFGXQEB
FZZKGOGBHBHRYRRKHXYA9YJDE9PGPJCSKGDAXRRCGA9JNFCDZQHIYUKQPXRZOURKIHYDYDGGWJJWDIQWB
```

## Reading The Data

We can retrieve the json data for all the objects in our database tables, or a subset.

We do this by running the following command:

```shell
node ./dist/tutorial read --table=tableName1 --ids=ids
```

The parameters are as follows:

* **table** - The table that you want to read the objects.
* **ids** - An optional comma separated list of the items you want to retrieve. If you don't provide this parameter then all of the items from the index will be retrieved.

### Examples

```shell
node ./dist/tutorial read --table=people
node ./dist/tutorial read --table=people --ids=WCTH9JEBYVKDXDEJBOVXFKWJLK9AHZJXWDIFVCNIBCTFIHKWVQFGQCQLLJGXZ9EWDTYNRGXFBGSFGXQEB
```

You should get a responses similar to the following.

```shell
Item: WCTH9JEBYVKDXDEJBOVXFKWJLK9AHZJXWDIFVCNIBCTFIHKWVQFGQCQLLJGXZ9EWDTYNRGXFBGSFGXQEB
{
    "id": "00000001",
    "name": "David Sønstebø"
}
Item: FZZKGOGBHBHRYRRKHXYA9YJDE9PGPJCSKGDAXRRCGA9JNFCDZQHIYUKQPXRZOURKIHYDYDGGWJJWDIQWB
{
    "id": "00000002",
    "title": "Dominik Schiener"
}
```

```shell
Item: WCTH9JEBYVKDXDEJBOVXFKWJLK9AHZJXWDIFVCNIBCTFIHKWVQFGQCQLLJGXZ9EWDTYNRGXFBGSFGXQEB
{
    "id": "00000001",
    "name": "David Sønstebø"
}
```

## Updating Data

Updating data is very similar to adding the data, it just removes the old id of the item being updated before it adds the new one.

We do this by running the following command:

```shell
node ./dist/tutorial update --table=tableName1 --data=path --tag=tag --id=id
```

The parameters are as follows:

* **table** - The table that you want to update the data in.
* **data** - The path to a .json file of data that you want to updated.
* **tag** - A tag to include on the tangle in trytes, max length 27.
* **id** - The id of the item to be updated.


### Examples

```shell
node ./dist/tutorial update --table=people --data=./data/object1b.json --id=WCTH9JEBYVKDXDEJBOVXFKWJLK9AHZJXWDIFVCNIBCTFIHKWVQFGQCQLLJGXZ9EWDTYNRGXFBGSFGXQEB
```

As with the create command you will be produced links to the tangle to view the new data.

## Deleting Data

Deleting data simply removed the hash of the given item from the index, nothing is really ever deleted from the tangle.

We do this by running the following command:

```shell
node ./dist/tutorial delete --table=tableName1 --id=id
```

The parameters are as follows:

* **table** - The table that you want to delete the data from.
* **id** - The id of the item to be deleted.


### Examples

```shell
node ./dist/tutorial delete --table=people --id=LUHSS9TXSQAUVEQSPVSRIEFDSEKPSQWCGDORXMIWNKBNUJFALFKTSDLFTPWMGXOTFRVNMIC9DLUO99999
```

## RSA Signing

Both the indexes and data transactions are signed and verified with RSA-SHA256. The public and private keys can be found in ./data/pub.key and ./data/priv.key respectively, you can replace these with your own keys.

# License

This project is licensed under the MIT License - see the [LICENSE](./LICENSE) file for details.
