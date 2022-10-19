require('dotenv').config({ path: 'test/.env-mocha' })

const { Neo4jContainer } = require('testcontainers');
const { describe, it, before } = require('mocha');
const { exit } = require('process');
const { setupLogger, setupNeo4j, buildApolloServer } = require('../src/setup');
const { TestAuthPlugin } = require('../src/plugins/TestAuthPlugin')

let logger;
let server;
let driver;


/************
 * CONSTANTS
 ************/
const NEO4J_IMAGE = 'neo4j:4.4.0-enterprise';

/*********************************************************
 * TEST SETUP - explicitly add any new tests to the list
 *********************************************************/

let TEST_SETUPS;
if (process.env.npm_config_dtest) {
    // run specific test with command example:
    // npm --Dtest=kafkaTests,userTests run test
    const testfiles = process.env.npm_config_dtest;
    try {
        TEST_SETUPS = []
        for (let testfile of testfiles.split(',')) {
            TEST_SETUPS.push(require(`./${testfile}`).default);
        }
    } catch (e) {
        console.log(e);
        console.log(`Could not import "./${testfiles}"`);
        exit(1);
    }

} else {
    // RUN ALL TESTS
    // tests will be run synchronously in the order they are in this list
    TEST_SETUPS = [
        require('./userTests').default,
    ]
}

describe('Designrvt', () => {

    before(async function() {
        try {
            logger=await setupLogger('logs/designRVT-graphql-tests.log','designrvt.test.designSessionTests');
            logger.info('Starting testcontainers.Neo4jContainer...');

            console.time('Test container startup');
            let container = await new Neo4jContainer(NEO4J_IMAGE)
                .withPassword(process.env.NEO4J_PASSWORD)
                .withApoc()
                .withEnv("NEO4J_ACCEPT_LICENSE_AGREEMENT", "yes")
                .start();
            console.timeEnd('Test container startup');
            process.env.NEO4J_URI = container.getBoltUri();
            process.env.NEO4J_USER = container.getUsername();
            process.env.NEO4J_PASSWORD = container.getPassword();

   
            driver = await setupNeo4j(new TestAuthPlugin());
            logger.info('neo4j started with:');
            logger.info('Bolt URI = '+container.getBoltUri());
            logger.info('HTTP URI = '+container.getHttpUri());
            logger.info('username = '+container.getUsername());
            logger.info('password = '+container.getPassword());
            
            server = await buildApolloServer();
        } catch (e) {
            logger.error(e);
        }
    });

    // after(function() {
    //     if (driver) driver.close();
    //     if (container) container.stop();
    // });

    it('', () => {
        // note: use `it` instead of `describe` because testServer will be created by this point
        for (let testSetup of TEST_SETUPS)
            testSetup(server, driver);
    });
});
