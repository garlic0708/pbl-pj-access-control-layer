'use strict';

let connector;
const chai = require('chai');
const expect = chai.expect;
const dynalite = require('dynalite');
const AWS = require('aws-sdk');
const { promisify } = require('util');
const proxyquire = require('proxyquire');
const chaiAsPromised = require("chai-as-promised");
chai.use(chaiAsPromised);
let dynaliteServer;
let dynamoClient;

before(async function () {
    const newConfig = { endpoint: 'http://localhost:4567', region: 'LOCAL' };
    connector = proxyquire('../../connectors/dynamo-connector', { '../config': { dynamoConfig: newConfig } });

    dynaliteServer = dynalite({ createTableMs: 0 });
    await promisify(dynaliteServer.listen).bind(dynaliteServer)(4567)
        .then(() => console.log('Mock server created'));

    dynamoClient = new AWS.DynamoDB(newConfig);
});

after(async () => {
    await promisify(dynaliteServer.close).bind(dynaliteServer)();
});

describe('Trusted Clients connector', function () {
    before(async () => {
        await promisify(dynamoClient.createTable).bind(dynamoClient)({
            TableName: 'UserTrustedClients',
            KeySchema: [{ AttributeName: 'userId', KeyType: 'HASH' }],
            AttributeDefinitions: [{ AttributeName: 'userId', AttributeType: 'S' }],
            ProvisionedThroughput: {
                ReadCapacityUnits: 10,
                WriteCapacityUnits: 10
            },
        });
        await promisify(dynamoClient.waitFor).bind(dynamoClient)('tableExists', { TableName: 'UserTrustedClients' })
            .then(() => console.log('Mock table created'))
    });

    it('should work normally', async function () {
        expect(connector.isClientTrusted('user', 'client')).to.be.rejected;

        await connector.addTrustedClient('user', 'client');
        expect(connector.isClientTrusted('user', 'client')).to.be.fulfilled;
    });
});

describe('Client Creator connector', function () {
    before(async () => {
        await promisify(dynamoClient.createTable).bind(dynamoClient)({
            TableName: 'ClientCreator',
            KeySchema: [{ AttributeName: 'clientId', KeyType: 'HASH' },
                { AttributeName: 'creatorId', KeyType: 'RANGE' }],
            AttributeDefinitions: [{ AttributeName: 'clientId', AttributeType: 'S' },
                { AttributeName: 'creatorId', AttributeType: 'S' }],
            ProvisionedThroughput: {
                ReadCapacityUnits: 10,
                WriteCapacityUnits: 10
            },
        });
        await promisify(dynamoClient.waitFor).bind(dynamoClient)('tableExists', { TableName: 'ClientCreator' })
            .then(() => console.log('Mock table created'))
    });

    it('should work normally', async function () {
        expect(await connector.listCreatedClients('creator')).to.have.lengthOf(0);
        await expect(connector.createClient('creator', 'client')).to.be.fulfilled;
        await expect(connector.createClient('creator', 'client')).to.be.rejected;
        await expect(connector.createClient('creator', 'client2')).to.be.fulfilled;
        expect(await connector.listCreatedClients('creator')).to.deep.equal(['client', 'client2'])
    });
});