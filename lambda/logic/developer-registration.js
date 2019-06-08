const AWS = require("aws-sdk");
const {defaultConfig, cognitoConfig} = require("../config");
const connector = require("../connectors/dynamo-connector");
const {promisify} = require("util");


async function registerNewClient(userId, clientName, scopes) {
    const idp = new AWS.CognitoIdentityServiceProvider(defaultConfig);
    const {UserPoolClient: {ClientId: clientId}} =
        await promisify(idp.createUserPoolClient).bind(idp)({
            ClientName: clientName,
            UserPoolId: cognitoConfig.userPoolId,
            AllowedOAuthScopes: scopes,
            CallbackURLs: ['http://localhost:4000'],
            AllowedOAuthFlows: ['code', 'implicit']
        });
    return connector.createClient(userId, clientId)
}

Object.assign(exports, {
    registerNewClient,
    listCreatedClients: connector.listCreatedClients,
});
