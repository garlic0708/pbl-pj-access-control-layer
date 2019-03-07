const cognitoTriggers = require("./logic/cognito-triggers");
const apiAuth = require("./logic/api-auth");
const sessionHandlers = require("./logic/session-handlers");
const developerRegistration = require("./logic/developer-registration");

const registerNewClientPath = 'registerNewClient';
const listCreatedClientsPath = 'listCreatedClients';

async function delegator(event) {
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
        const sessionType = event.queryStringParameters['session_type'];
        const func = sessionType === 'main' ? apiAuth.jwtVerifier : apiAuth.subSessionVerifier;
        return func(event)
    }

    // HTTP API
    if ('httpMethod' in event) {
        const {
            requestContext: { authorizer: { principalId: userId } },
        } = event;
        switch (event.path.slice(1)) {
            case registerNewClientPath:
                const { clientName, scopes } = JSON.parse(event.body);
                return developerRegistration.registerNewClient(userId, clientName, scopes);
            case listCreatedClientsPath:
                return developerRegistration.listCreatedClients(userId)
        }
    }

    // WS API
    else {
        const { requestContext: { routeKey, authorizer: { sessionType } } } = event;
        const methodMap = {
            main: {
                connect: sessionHandlers.addMainSession,
                default: sessionHandlers.msSend,
                disconnect: sessionHandlers.detachMainSession,
                getMSId: sessionHandlers.getMSId,
            },
            sub: {
                connect: sessionHandlers.addSubSession,
                default: sessionHandlers.ssSend,
                disconnect: sessionHandlers.detachSubSession,
            }
        };
        const parsedRouteKey = routeKey.startsWith('$') ? routeKey.slice(1) : routeKey;
        return methodMap[sessionType][parsedRouteKey](event)
    }
}


exports.delegator = delegator;
