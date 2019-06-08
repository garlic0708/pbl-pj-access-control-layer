const connector = require("../connectors/redis-connector");
const {callbackToWs} = require("../connectors/ws-callback");
const {getUser} = require('../connectors/redis-connector');
const {addTrustedClient, isClientTrusted} = require('../connectors/dynamo-connector');
const AWS = require("aws-sdk");
const {promisify} = require("util");
const {defaultConfig, cognitoConfig} = require("../config");


async function addMainSession(event) {
    const {
        requestContext: {
            connectionId: msId,
            authorizer: {principalId: userId, username}
        }
    } = event;

    await connector.addMainSession(userId, msId, username);
    // We cannot send the connectionId directly back here.
}

async function addSubSession(event) {
    const {
        queryStringParameters: {msId, clientId},
        requestContext: {connectionId: ssId}
    } = event;

    await connector.addSubSession(msId, ssId, clientId)
}

async function getSessionType(event) {
    const {requestContext: {connectionId}} = event;
    const sessionType = await connector.isMsOrSs(connectionId);
    console.log('session type is', sessionType);
    return sessionType;
}

async function detach(event) {
    const sessionType = await getSessionType(event);
    return sessionType === 'ms' ? detachMainSession(event) : detachSubSession(event)
}

async function send(event) {
    const sessionType = await getSessionType(event);
    return sessionType === 'ms' ? msSend(event) : ssSend(event)
}

async function detachMainSession(event) {
    await connector.detachMainSession(event.requestContext.connectionId)

    // todo Maybe sub-session connections should be closed here?
    //  The WS API Gateway docs state that it supports closing a connection from server side,
    //  but the function is not yet implemented.
    //  Maybe we could just stay here, and if any detachSubSession is occurred after detachMainSession,
    //  its disconnect handler simply throws an error, affecting nothing.
}

async function detachSubSession(event) {
    await connector.detachSubSession(event.requestContext.connectionId)
}

async function getSessionId(event) {
    const {requestContext} = event;
    const {connectionId: sessionId} = requestContext;
    await callbackToWs(requestContext, {sessionId})
}

async function msSend(event) {
    const {body, requestContext} = event;
    const {ssId, ...rest} = JSON.parse(body);
    await callbackToWs(requestContext, rest, ssId)
}

async function ssSend(event) {
    const {body, requestContext} = event;
    const {connectionId: ssId} = requestContext;
    const msId = await connector.getMainSession(ssId);
    await callbackToWs(requestContext, body, msId)
}

async function trustClient(event) {
    const {requestContext, body} = event;
    const {connectionId: msId} = requestContext;
    const {clientId} = JSON.parse(body);
    const {userId} = await getUser(msId);
    await addTrustedClient(userId, clientId);
    await callbackToWs(requestContext, {trustedClient: clientId})
}

async function getClientName(event) {
    const {requestContext, body} = event;
    const {clientId} = JSON.parse(body);
    console.log('clientId', clientId);
    const idp = new AWS.CognitoIdentityServiceProvider(defaultConfig);
    try {
        const {UserPoolClient: {ClientName: clientName}} =
            await promisify(idp.describeUserPoolClient).bind(idp)({
                UserPoolId: cognitoConfig.userPoolId,
                ClientId: clientId,
            });
        return callbackToWs(requestContext, {clientName, clientId,})
    } catch (e) {
        return callbackToWs(requestContext,
            {clientNameError: 'Client Id does not exist', clientId,})
    }
}

async function isClientTrustedFunc(event) {
    const {requestContext, body} = event;
    const {connectionId: msId} = requestContext;
    const {clientId} = JSON.parse(body);
    const {userId} = await getUser(msId);
    const result = await isClientTrusted(userId, clientId)
        .then(() => true)
        .catch(() => false);
    return callbackToWs(requestContext, {isClientTrusted: result, clientId,})
}

Object.assign(exports, {
    addMainSession,
    addSubSession,
    detach,
    getSessionId,
    send,
    trustClient,
    getClientName,
    isClientTrustedFunc,
});
