const connector = require("../connectors/redis-connector");
const { callbackToWs } = require("../connectors/ws-callback");


async function addMainSession(event) {
    const {
        requestContext: {
            connectionId: msId,
            authorizer: { principalId: userId, username }
        }
    } = event;

    await connector.addMainSession(userId, msId, username);
    // We cannot send the connectionId directly back here.
}

async function addSubSession(event) {
    const {
        queryStringParameters: { msId, clientId },
        requestContext: { connectionId: ssId }
    } = event;

    await connector.addSubSession(msId, ssId, clientId)
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

async function getMSId(event) {
    const { requestContext } = event;
    const { connectionId: msId } = requestContext;
    await callbackToWs(requestContext, { msId })
}

async function msSend(event) {
    const { body, requestContext } = event;
    const { queryStringParameters: { ssId } } = requestContext;
    await callbackToWs(requestContext, body, ssId)
}

async function ssSend(event) {
    const { body, requestContext } = event;
    const { connectionId: ssId } = requestContext;
    const msId = await connector.getMainSession(ssId);
    await callbackToWs(requestContext, body, msId)
}

Object.assign(exports, {
    addMainSession,
    addSubSession,
    detachSubSession,
    detachMainSession,
    getMSId,
    msSend,
    ssSend,
});