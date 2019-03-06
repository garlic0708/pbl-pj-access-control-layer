const { lazyLoader } = require("../utils/lazy-loader");
const AWS = require('aws-sdk');
const { promisify } = require('util');

const { dynamoConfig } = require("../config");

const trustedClientsTableName = 'UserTrustedClients';
const clientCreatorTableName = 'ClientCreator';
const trustedClientsAttrName = 'TrustedClients';

function dynamoFactory() {
    console.log('Creating DynamoDB client with config', dynamoConfig);
    return new AWS.DynamoDB(dynamoConfig)
}

const getDynamo = lazyLoader(dynamoFactory);

function getKey(userId) {
    return { userId: { S: userId } }
}

async function addTrustedClient(userId, clientId) {
    const dynamo = getDynamo();
    return promisify(dynamo.updateItem).bind(dynamo)({
        TableName: trustedClientsTableName,
        Key: getKey(userId),
        UpdateExpression: 'add #a :client',
        ExpressionAttributeNames: { '#a': trustedClientsAttrName },
        ExpressionAttributeValues: {
            ':client': { SS: [clientId] },
        }
    })
}

async function isClientTrusted(userId, clientId) {
    const dynamo = getDynamo();
    return promisify(dynamo.query).bind(dynamo)({
        TableName: trustedClientsTableName,
        KeyConditionExpression: '#u = :user',
        FilterExpression: 'contains(#a, :client)',
        ExpressionAttributeNames: { '#a': trustedClientsAttrName, '#u': 'userId' },
        ExpressionAttributeValues: { ':user': { S: userId }, ':client': { S: clientId } },
    }).then(data => {
        if (!data.Count) throw { err: 'ClientNotTrusted' }
    })
}

async function createClient(creatorId, clientId) {
    const dynamo = getDynamo();
    return promisify(dynamo.putItem).bind(dynamo)({
        TableName: clientCreatorTableName,
        Item: { creatorId: { S: creatorId }, clientId: { S: clientId } },
        ConditionExpression: 'attribute_not_exists(clientId)'
    })
}

async function listCreatedClients(creatorId) {
    const dynamo = getDynamo();
    return promisify(dynamo.scan).bind(dynamo)({
        TableName: clientCreatorTableName,
        FilterExpression: '#cr = :creator',
        ExpressionAttributeNames: { '#cr': 'creatorId' },
        ExpressionAttributeValues: { ':creator': { S: creatorId } }
    }).then(v => v.Items.map(i => i.clientId.S))
}

Object.assign(exports, {
    addTrustedClient,
    isClientTrusted,
    createClient,
    listCreatedClients,
});