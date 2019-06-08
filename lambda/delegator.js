const cognitoTriggers = require("./logic/cognito-triggers");
const apiAuth = require("./logic/api-auth");
const sessionHandlers = require("./logic/session-handlers");
const developerRegistration = require("./logic/developer-registration");
const {testRedis} = require('./connectors/redis-connector');

const registerNewClientPath = 'registerNewClient';
const listCreatedClientsPath = 'listCreatedClients';

async function delegator(event) {
    console.log('event received: ', event);

    // This is for debugging connection to redis cluster
    if ('test' in event) {
        return testRedis()
    }

    // Cognito trigger
    if ('triggerSource' in event) {
        const triggerMap = {
            'Create': cognitoTriggers.createChallenge,
            'Define': cognitoTriggers.defineChallenge,
            'Verify': cognitoTriggers.verifyAnswer,
            'TokenG': cognitoTriggers.preTokenGenerate,
        };
        return triggerMap[event.triggerSource.slice(0, 6)](event)
    }

    // API GW Authorizer
    if ('methodArn' in event && event.methodArn.startsWith('arn:aws:execute-api')) {
        const sessionType = event.queryStringParameters['session_type'] || event.headers['X-Session-Type'];
        const func = sessionType === 'main' ? apiAuth.jwtVerifier : apiAuth.subSessionVerifier;
        return func(event)
    }

    let body;

    // HTTP API
    if ('httpMethod' in event) {
        const {
            requestContext: {authorizer: {principalId: userId}},
        } = event;
        switch (event.path.slice(1)) {
            case registerNewClientPath:
                const {clientName, scopes} = JSON.parse(event.body);
                body = await developerRegistration.registerNewClient(userId, clientName, scopes);
                break;
            case listCreatedClientsPath:
                body = await developerRegistration.listCreatedClients(userId)
        }
    }

    // WS API
    else {
        const {requestContext: {routeKey, authorizer: {sessionType}}} = event;
        const methodMap = {
            main: sessionHandlers.addMainSession,
            sub: sessionHandlers.addSubSession,
            default: sessionHandlers.send,
            disconnect: sessionHandlers.detach,
            getSessionId: sessionHandlers.getSessionId,
            trustClient: sessionHandlers.trustClient,
            getClientName: sessionHandlers.getClientName,
            isClientTrusted: sessionHandlers.isClientTrustedFunc,
        };
        const parsedRouteKey = routeKey.startsWith('$') ? routeKey.slice(1) : routeKey;
        const func = parsedRouteKey === 'connect' ? methodMap[sessionType] : methodMap[parsedRouteKey];
        body = await func(event);
    }

    return {
        isBase64Encoded: false,
        statusCode: 200,
        headers: {},
        body: JSON.stringify(body),
    }
}


exports.delegator = delegator;
