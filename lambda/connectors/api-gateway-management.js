require('aws-sdk/lib/node_loader');
const AWS = require('aws-sdk/lib/core');
const Service = AWS.Service;
const apiLoader = AWS.apiLoader;
apiLoader.services['apigatewaymanagementapi'] = {};

// Since the version of AWS-SDK that Lambda provides has no APIgw management API,
// We apply the patch here manually.
AWS.ApiGatewayManagementApi = Service.defineService('apigatewaymanagementapi', ['2018-11-29']);
Object.defineProperty(apiLoader.services['apigatewaymanagementapi'], '2018-11-29', {
    get: function get() {
        const model = {
            "metadata": {
                "apiVersion": "2018-11-29",
                "endpointPrefix": "execute-api",
                "signingName": "execute-api",
                "serviceFullName": "AmazonApiGatewayManagementApi",
                "serviceId": "ApiGatewayManagementApi",
                "protocol": "rest-json",
                "jsonVersion": "1.1",
                "uid": "apigatewaymanagementapi-2018-11-29",
                "signatureVersion": "v4"
            },
            "operations": {
                "PostToConnection": {
                    "http": {
                        "requestUri": "/@connections/{connectionId}",
                        "responseCode": 200
                    },
                    "input": {
                        "type": "structure",
                        "members": {
                            "Data": {
                                "type": "blob"
                            },
                            "ConnectionId": {
                                "location": "uri",
                                "locationName": "connectionId"
                            }
                        },
                        "required": [
                            "ConnectionId",
                            "Data"
                        ],
                        "payload": "Data"
                    }
                }
            },
            "shapes": {}
        };
        model.paginators = {
            "pagination": {}
        };
        return model;
    },
    enumerable: true,
    configurable: true
});
module.exports = AWS.ApiGatewayManagementApi;