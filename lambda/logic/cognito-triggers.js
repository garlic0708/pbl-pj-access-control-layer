const connector = require("../connectors/redis-connector");
const AWS = require("aws-sdk");
const { defaultConfig, cognitoConfig } = require("../config");
const { promisify } = require("util");

const CHALLENGE_NAME = 'CUSTOM_CHALLENGE';

async function defineChallenge(event) {
    const { request: { session }, response } = event;
    if (!session.length) {
        response.challengeName = CHALLENGE_NAME;
        response.failAuthentication = false;
        response.issueTokens = false;
    } else {
        response.issueTokens = session[0].challengeName === CHALLENGE_NAME && session[0].challengeResult;
        response.failAuthentication = !response.issueTokens
    }
    return event
}

async function createChallenge(event) {
    const {
        request: { challengeName: cn }, response,
        callerContext: { clientId }
    } = event;
    if (cn === CHALLENGE_NAME) response.privateChallengeParameters = { clientId };
    return event
}

async function verifyAnswer(event) {
    const {
        request: {
            privateChallengeParameters: { clientId },
            userAttributes: { sub: userId },
            challengeAnswer,
        },
        response
    } = event;
    const { msId, ssId } = JSON.parse(challengeAnswer);
    const [actualSSId, actualUserId] = await Promise.all([
        connector.getSubSession(msId, clientId),
        connector.getUser(msId).then(({ userId }) => userId),
    ]);
    response.answerCorrect = actualSSId === ssId && actualUserId === userId;
    return event
}

/*
We are here transforming the id token into an access token, by adding the scope claim.
Unfortunately Cognito doesn't support putting a client's associated scopes into access tokens it applies for,
when the CUSTOM_AUTH flow is applied, and only the id token can be custom modified.
So we'd have to use this compromised method: issue the id token with scopes,
and use it for AUTHORIZATION instead of AUTHENTICATION.
This method doesn't introduce any extra security risk as compared with using the original access token, for:
1. Access tokens that Cognito itself issues doesn't contain the **aud** claim, so even with the original
access token the API cannot verify that the API is the intended audience of the token;
2. Both the access token and the id token are issued and signed by Cognito, not with the private key known
to the client itself, so both tokens can be equivalently trusted.
So the only essential difference between the two tokens is their intended uses (the token_use claim).
*/
async function preTokenGenerate(event) {
    const { triggerSource, callerContext: { clientId } } = event;
    if (triggerSource !== 'TokenGeneration_HostedAuth') {
        const idp = new AWS.CognitoIdentityServiceProvider(defaultConfig);
        const { UserPoolClient: { AllowedOAuthScopes: scopes } } =
            await promisify(idp.describeUserPoolClient).bind(idp)({
                UserPoolId: cognitoConfig.userPoolId,
                ClientId: clientId,
            });
        event.response = {
            claimsOverrideDetails: {
                claimsToAddOrOverride: {
                    scope: scopes.join(' '),
                },
            }
        };
    }
    return event
}

Object.assign(exports, {
    defineChallenge,
    createChallenge,
    verifyAnswer,
    preTokenGenerate,
});