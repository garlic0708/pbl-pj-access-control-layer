const { pemFactory, audienceFactory } = require("../config");
const jwt = require('jsonwebtoken');
const { promisify } = require('util');
const { getUser } = require('../connectors/redis-connector');
const { isClientTrusted } = require('../connectors/dynamo-connector');


const generateAllow = function (principalId, resource, extraValues) {
    return generatePolicy(principalId, 'Allow', resource, extraValues);
};

// Help function to generate an IAM policy
const generatePolicy = function (principalId, effect, resource, extraValues) {
    // Required output:
    const authResponse = {};
    authResponse.principalId = principalId;
    if (effect && resource) {
        const policyDocument = {};
        policyDocument.Version = '2012-10-17'; // default version
        policyDocument.Statement = [];
        const statementOne = {};
        statementOne.Action = 'execute-api:Invoke'; // default action
        statementOne.Effect = effect;
        statementOne.Resource = resource;
        policyDocument.Statement[0] = statementOne;
        authResponse.policyDocument = policyDocument;
    }
    // Optional output with custom properties of the String, Number or Boolean type.
    authResponse.context = extraValues;
    return authResponse;
};


async function verifyJwt(token, algorithms = ['RS256']) {
    const { header: { kid } } = await promisify(jwt.decode)(token, { complete: true });
    // Cognito-issued access tokens don't include the audience claim
    return await promisify(jwt.verify)(token, pemFactory(kid), { algorithms })
        .then(t => {
            if (t['client_id'] !== audienceFactory()) throw { err: 'ClientIdMismatch' };
            return t
        })
}

async function verifySubSession(msId, clientId) {
    let uId;
    return getUser(msId)
        .then(({ userId }) => {
            uId = userId;
            return isClientTrusted(userId, clientId);
        }).then(() => uId)
}

exports.jwtVerifier = async event => {
    console.log('Verifying main session:', JSON.stringify(event, null, 2));

    const queryStringParameters = event.queryStringParameters;

    return verifyJwt(queryStringParameters['access_token'])
        .then(payload => generateAllow(payload.sub, event.methodArn, {
            username: payload.username,
            sessionType: 'main',
        },))
        .catch(() => {
            throw "Unauthorized";
        });
};

exports.subSessionVerifier = async event => {
    console.log('Verifying sub-session:', JSON.stringify(event, null, 2));

    const queryStringParameters = event.queryStringParameters;

    return verifySubSession(queryStringParameters['msId'], queryStringParameters['clientId'])
        .then(userId => generateAllow(userId, event.methodArn, { sessionType: 'sub' }))
        .catch(() => {
            throw "Unauthorized";
        })
};