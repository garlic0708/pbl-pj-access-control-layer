const redis = require('redis');
const { promisify } = require('util');
const redisUrl = process.env.REDIS_URL;
const { lazyLoader } = require("../utils/lazy-loader");


function clientFactory() {
    return redis.createClient(6379, redisUrl);
}

const getClient = lazyLoader(clientFactory);

function promisifyOper(obj, oper, ...params) {
    return (promisify(obj[oper]).bind(obj))(...params)
}

/**
 * Executes a single command on the client singleton
 * @param cmd
 * @param params
 * @returns {*}
 */
function command(cmd, ...params) {
    return promisifyOper(getClient(), cmd, ...params)
}

/**
 * Executes a transaction based on the given Multi object
 * @param multi
 * @returns {Promise<any>}
 */
function execMulti(multi) {
    return promisifyOper(multi, 'exec').then(v => {
        console.log(`execMulti received reply ${JSON.stringify(v)}`);
        if (v === null) throw { err: 'ExecMultiFailed' }
    });
}

function getMSUserKey(msId) {
    return `mainSession:${msId}:user`
}

function getMSClientKey(msId, clientId) {
    return `mainSession:${msId}:subSession:${clientId}`
}

function extractClientFromKey(msClientKey) {
    return msClientKey.split(':')[3]
}

function getSSKey(ssId) {
    return `subSession:${ssId}`
}

const loggedInUsersSetKey = 'loggedInUsers';

const msHashKey = 'mainSession';
const clientHashKey = 'client';
const accessTokenHashKey = 'accessToken';
const refreshTokenHashKey = 'refreshToken';
const userIdHashKey = 'userId';
const usernameHashKey = 'username';

/**
 * Validates multiple promises against conditions **concurrently**
 * @param handler What to do when any promise fails its condition. Should throw an error
 * @param conditions
 * @returns {Promise<any[]>}
 */
function validate(handler, ...conditions) {
    return Promise.all(conditions.map(({ promise, condition, err }) =>
        promise.then(v => {
            console.log(`Validating against ${err}, got result ${v}${condition(v) ? ' fail' : ''}`);
            // Note the 'return' here: without it this statement would become simply
            // a call to an async function without rejection handling
            if (condition(v)) return handler({ err });
        })
    ))
}

async function unwatchHandler(err) {
    console.log('unwatch');
    await command('unwatch');
    throw err
}

exports.addMainSession = async (userId, msId, username) => {
    const msUserKey = getMSUserKey(msId);
    await command('watch', msUserKey, loggedInUsersSetKey);
    await validate(unwatchHandler, {
        promise: command('exists', msUserKey), condition: v => v === 1, err: 'MainSessionAlreadyExists',
    }, {
        promise: command('sismember', loggedInUsersSetKey, userId),
        condition: v => v === 1,
        err: 'UserAlreadyLoggedIn',
    });

    console.log('Validation passed');

    const multi = getClient().multi()
        .hmset(msUserKey, userIdHashKey, userId, usernameHashKey, username)
        .sadd(loggedInUsersSetKey, userId);
    return await execMulti(multi)
};

exports.addSubSession = async (msId, ssId, clientId) => {
    const msUserKey = getMSUserKey(msId);
    const ssKey = getSSKey(ssId);
    const msClientKey = getMSClientKey(msId, clientId);
    await command('watch', msUserKey, ssKey, msClientKey);
    await validate(unwatchHandler, {
        promise: command('exists', msUserKey), condition: v => v !== 1, err: 'MainSessionNotRegistered',
    }, {
        promise: command('exists', ssKey), condition: v => v === 1, err: 'SubSessionAlreadyExists',
    }, {
        // Currently we don't allow one client to have multiple sub-sessions within one main session
        promise: command('exists', msClientKey),
        condition: v => v === 1,
        err: 'ClientAlreadyRegistered',
    },);

    console.log('Validation passed');

    const multi = getClient().multi()
        .set(msClientKey, ssId)
        .hmset(ssKey, msHashKey, msId, clientHashKey, clientId);
    return await execMulti(multi)
};

exports.getAllClients = async (msId) => {
    let cursor = 0, part;
    const result = [];
    const msClientKey = getMSClientKey(msId, '*');
    do {
        [cursor, part] = await command('scan', cursor, 'match', msClientKey);
        result.push(...part)
    } while (+cursor !== 0);
    return result.map(extractClientFromKey)
};

exports.getUser = async (msId) => {
    return await command('hmget', getMSUserKey(msId), userIdHashKey, usernameHashKey)
        .then(([userId, username]) => userId ? { userId, username } : null)
};

exports.getSubSession = async (msId, clientId) => {
    return await command('get', getMSClientKey(msId, clientId))
};

exports.getMainSession = async (ssId) => {
    return await command('hget', getSSKey(ssId), msHashKey)
};

exports.setToken = async (ssId, accessToken, refreshToken) => {
    const ssKey = getSSKey(ssId);
    await command('watch', ssKey);
    await validate(unwatchHandler, {
        promise: command('exists', ssKey), condition: v => v !== 1, err: 'SubSessionNotRegistered',
    });

    let multi = getClient().multi().hset(ssKey, accessTokenHashKey, accessToken);
    if (refreshToken) multi = multi.hset(ssKey, refreshTokenHashKey, refreshToken);
    return execMulti(multi)
};

exports.getToken = async (ssId) => {
    return command('hmget', getSSKey(ssId), accessTokenHashKey, refreshTokenHashKey)
        .then(([accessToken, refreshToken]) => {
            return { accessToken, refreshToken }
        })
};

exports.detachSubSession = async (ssId) => {
    const ssKey = getSSKey(ssId);

    // We assume here that no unexpected manipulation has been made
    // and our state is consistent (i.e. ssKey and msClientKey must both exist or neither),
    // so existence of ssKey alone is sufficient validation for us to take further steps.
    await command('watch', ssKey);

    // Check existence of ssKey while executing HMGET
    const [msId, clientId] = await command('hmget', ssKey, msHashKey, clientHashKey)
        .catch(unwatchHandler);

    const multi = getClient().multi()
        .del(ssKey)
        .del(getMSClientKey(msId, clientId));
    return await execMulti(multi)
};

exports.detachMainSession = async (msId) => {
    const msKey = getMSUserKey(msId);
    await command('watch', msKey);

    // This hard-to-read pile of code should do the following:
    // Get all clients in the form of {ssId, clientId} into variable clients
    // noinspection JSCheckFunctionSignatures
    const [userId, clients] = await Promise.all([command('hget', msKey, userIdHashKey).catch(unwatchHandler),
        exports.getAllClients(msId).then(
            clientIds => Promise.all(clientIds.map( // Get ssIds from clientIds
                clientId => exports.getSubSession(msId, clientId).then(ssId => { // Put ssId and clientId together
                    return { ssId, clientId }
                }))))]);

    let multi = getClient().multi()
        .del(msKey)
        .srem(loggedInUsersSetKey, userId);
    clients.forEach(({ ssId, clientId }) => multi = multi
        .del(getSSKey(ssId))
        .del(getMSClientKey(msId, clientId)));
    return await execMulti(multi)
};

exports.quitClient = () => getClient().quit();