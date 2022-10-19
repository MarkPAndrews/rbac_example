const assert = require('assert');
const {before, describe, it} = require('mocha');
const {loadTestData, sendGql, sendGqlAllOutput} = require('./testUtil');

export default function(testServer, driver) {
    describe('User tests', function() {
        const CURRENT_USER_QRY = `query { getCurrentUser {username name roles {name}} }`;
        const AGREEMENTS_QRY = `query{agreements {id name}}`;
        const AGREEMENT_QRY = `query get($id: Int!) {agreements (where:{id:$id}) {id name}}`;

        before(async () => {
            await loadTestData('test/data/baseData.cypher',driver);
        });
        
        it('getCurrentUser test', async () => {
            const result = await sendGql(testServer, CURRENT_USER_QRY, null, 'eastUser')
            const actualUser = result.getCurrentUser;
            assert.strictEqual(actualUser.username, 'eastUser');
            assert.strictEqual(actualUser.name, 'east');
        });

        it('getCurrentUser does not exist test', async () => {
            const response = (await sendGqlAllOutput(testServer, CURRENT_USER_QRY, null, 'doesnotexist'));
            assert.strictEqual(response.extensions.code,'UNAUTHENTICATED');
        });

        it('agreements test', async () => {
            let agreements = (await sendGql(testServer, AGREEMENTS_QRY, null, 'eastUser')).agreements;

            assert.strictEqual(agreements.length, 5);
        });

        it('agreements failure test', async () => {
            let agreements = (await sendGql(testServer, AGREEMENT_QRY, {id:7}, 'eastUser')).agreements;

            assert.strictEqual(agreements.length, 0);
        });

    });
}