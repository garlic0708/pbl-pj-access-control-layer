'use strict';

let connector;
const chai = require('chai');
const expect = chai.expect;
const chaiAsPromised = require("chai-as-promised");
const mockery = require('mockery');
const fakeRedis = require('fakeredis');
chai.use(chaiAsPromised);

before(() => {
    mockery.enable({ warnOnReplace: true });
    mockery.registerMock('redis', fakeRedis);
    connector = require('../../connectors/redis-connector');
});
after(() => {
    connector.quitClient();
    mockery.deregisterAll();
    mockery.disable()
});

describe('Redis connector', function () {
    it('should work normally', async function () {
        console.log('Part 1: Before adding MS');
        await expect(connector.addSubSession('ms1', 'ss1', 'client1')).to.be.rejected;
        expect(await connector.getUser('ms1')).to.be.null;

        console.log('Part 2: After adding MS');
        await expect(connector.addMainSession('user', 'ms1', 'username')).to.be.fulfilled;
        expect(await connector.getUser('ms1')).to.deep.equal({ userId: 'user', username: 'username' });
        expect(await connector.getAllClients('ms1')).to.have.lengthOf(0);
        await expect(connector.addMainSession('user', 'ms2', 'username')).to.be.rejected;

        console.log('Part 3: After adding SS');
        await expect(connector.addSubSession('ms1', 'ss1', 'client1')).to.be.fulfilled;
        expect(await connector.getSubSession('ms1', 'client1')).to.equal('ss1');
        expect(await connector.getMainSession('ss1')).to.equal('ms1');
        expect(await connector.getAllClients('ms1')).to.have.lengthOf(1).and.to.include('client1');

        console.log('Part 4: Tokens');
        expect(await connector.getToken('ss1')).to.deep.equal({ accessToken: null, refreshToken: null });
        await expect(connector.setToken('ss1', 'at', 'rt')).to.be.fulfilled;
        expect(await connector.getToken('ss1')).to.deep.equal({ accessToken: 'at', refreshToken: 'rt' });
        await expect(connector.setToken('ss1', 'at2')).to.be.fulfilled;
        expect(await connector.getToken('ss1')).to.deep.equal({ accessToken: 'at2', refreshToken: 'rt' });

        console.log('Part 5: Adding another SS and detaching SS');
        await expect(connector.addSubSession('ms1', 'ss2', 'client2')).to.be.fulfilled;
        await expect(connector.detachSubSession('ss1')).to.be.fulfilled;
        expect(await connector.getMainSession('ss1')).to.be.null;
        expect(await connector.getAllClients('ms1')).to.have.lengthOf(1).and.to.include('client2');

        console.log('Part 6: Detaching MS');
        await expect(connector.detachMainSession('ms1')).to.be.fulfilled;
        expect(await connector.getUser('ms1')).to.be.null;
        expect(await connector.getMainSession('ss2')).to.be.null;
        expect(await connector.getAllClients('ms1')).to.have.lengthOf(0);
    }).timeout(3000);
});