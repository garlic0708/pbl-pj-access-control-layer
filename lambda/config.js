const defaultConfig = { region: 'us-west-2' };

const dynamoConfig = {
    ...defaultConfig,
    apiVersion: '2012-08-10',
};

const cognitoConfig = { userPoolId: 'us-west-2_nSQkWbdyF' };

exports.defaultConfig = defaultConfig;
exports.dynamoConfig = dynamoConfig;
exports.cognitoConfig = cognitoConfig;

