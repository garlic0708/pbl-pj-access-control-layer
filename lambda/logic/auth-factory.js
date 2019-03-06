const jwkToPem = require("jwk-to-pem");
const exampleJwks = require("../example-jwks");

function pemFactory() {
    return jwkToPem(exampleJwks)
    // return 'secret' // todo
}

function audienceFactory() {
    return 'audience' // todo should return client id of main session
}

exports.pemFactory = pemFactory;
exports.audienceFactory = audienceFactory;

