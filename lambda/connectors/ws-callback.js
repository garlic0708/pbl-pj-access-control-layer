const AWS = require("aws-sdk");
const {lazyLoader} = require("../utils/lazy-loader");


/**
 * Get the WS callback URL for a request context.
 * This assumes that all our WS APIs are deployed with the same domain and stage,
 * so we simply imply these two parameters from the request context.
 * @param requestContext
 */
function managementApiFactory(requestContext) {
    const { domain, stage } = requestContext;
    return new AWS.ApiGatewayManagementApi({
        apiVersion: '2018-11-29',
        endpoint: `${domain}/${stage}`
    })
}

const getManagementApi = lazyLoader(managementApiFactory);


/**
 * Send data to a connected WS client.
 * The connection id from the context is used if connectionId is not explicitly given.
 * @param requestContext
 * @param content
 * @param connectionId
 * @returns {Promise<PromiseResult<{}, AWSError>>}
 */
async function callbackToWs(requestContext, content, connectionId) {
    if (!connectionId) connectionId = requestContext.connectionId;
    return getManagementApi(requestContext).postToConnection({
        ConnectionId: connectionId,
        Data: content,
    }).promise()
}

exports.callbackToWs = callbackToWs;
