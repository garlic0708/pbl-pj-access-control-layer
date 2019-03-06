const AWS = require("aws-sdk");
const { lazyLoader } = require("../utils/lazy-loader");
const { promisify } = require("util");
const connector = require("../connectors/redis-connector");
const { defaultConfig } = require("../config");
const jwt = require("jsonwebtoken");


const getIdP = lazyLoader(() => new AWS.CognitoIdentityServiceProvider(defaultConfig));

async function getAccessToken(clientId, msId, ssId) {
    let { accessToken, refreshToken } = await connector.getToken(ssId);
    const idp = getIdP();
    if (!accessToken) {
        const username = (await connector.getUser(msId)).username;
        const { Session: session } = await promisify(idp.initiateAuth).bind(idp)({
            AuthFlow: 'CUSTOM_AUTH',
            ClientId: clientId,
            AuthParameters: { USERNAME: username },
        });
        // As stated in the cognito pre-token-generate trigger,
        // we are using the IdToken for access token
        const { AuthenticationResult: { IdToken: newAccessToken, RefreshToken: newRefreshToken } }
            = await promisify(idp.respondToAuthChallenge).bind(idp)({
            ChallengeName: 'CUSTOM_CHALLENGE',
            ClientId: clientId,
            Session: session,
            ChallengeResponses: {
                USERNAME: username,
                ANSWER: JSON.stringify({ msId, ssId })
            }
        });
        await connector.setToken(ssId, newAccessToken, newRefreshToken);
        accessToken = newAccessToken
    } else if (jwt.decode(accessToken).exp * 1000 < Date.now()) {
        const { AuthenticationResult: { IdToken: newAccessToken } } =
            await promisify(idp.initiateAuth).bind(idp)({
                AuthFlow: 'REFRESH_TOKEN_AUTH',
                ClientId: clientId,
                AuthParameters: { REFRESH_TOKEN: refreshToken }
            });
        await connector.setToken(ssId, newAccessToken);
        accessToken = newAccessToken
    }
    return accessToken
}

exports.getAccessToken = getAccessToken;
