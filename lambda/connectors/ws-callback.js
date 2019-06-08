const AWS = require("aws-sdk");
require('./api-gateway-management');


/**
 * Get the WS callback URL for a request context.
 * This assumes that all our WS APIs are deployed with the same domain and stage,
 * so we simply imply these two parameters from the request context.
 * @param requestContext
 */
function managementApiFactory(requestContext) {
    const { domainName: domain, stage } = requestContext;
    return new AWS.ApiGatewayManagementApi({
        apiVersion: '2018-11-29',
        endpoint: `${domain}/${stage}`
    })
}


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
    const apiGatewayManagementApi = managementApiFactory(requestContext);
    console.log('management api', apiGatewayManagementApi);
    await apiGatewayManagementApi.postToConnection({
        ConnectionId: connectionId,
        Data: JSON.stringify(content),
    }).promise()
}

exports.callbackToWs = callbackToWs;
