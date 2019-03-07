const jwkToPem = require("jwk-to-pem");
const jwks = require("./jwks");

const defaultConfig = { region: 'us-west-2' };

const dynamoConfig = {
    ...defaultConfig,
    apiVersion: '2012-08-10',
};

const cognitoConfig = { userPoolId: 'us-west-2_nSQkWbdyF' };

function pemFactory(keyId) {
    return jwkToPem(jwks.keys.filter(({ kid }) => kid === keyId)[0])
}

function audienceFactory() {
    return process.env['MS_CLIENT']
}

Object.assign(exports, {
    defaultConfig,
    dynamoConfig,
    cognitoConfig,
    pemFactory,
    audienceFactory,
});