import { existsSync, mkdirSync } from "fs";
import log4js from "log4js";
import { ApolloServer, AuthenticationError } from "apollo-server-express";
import { ApolloServerPluginDrainHttpServer } from "apollo-server-core";
import express from 'express';
import { WebSocketServer } from "ws";
import path from "path";
import { readdirSync } from "fs";
import { mergeResolvers } from "@graphql-tools/merge";
import { loadFilesSync } from "@graphql-tools/load-files";
import { Neo4jGraphQL } from "@neo4j/graphql";
import { useServer } from "graphql-ws/lib/use/ws";

export let neoSchema;
export let schema;
export let logger;
export let driver;
export let databaseName;
export let authPlugin;
const neo4j = require('neo4j-driver');

const USER_QUERY =`
MATCH (u:User{username:$user,loginAllowed:True})
OPTIONAL MATCH (u)-[:HAS_ROLE]->(r) 
RETURN u{.*,roles:collect(r.name)} as u
`;

export async function setupLogger(filename, name) {
    /*************
     * CONSTANTS *
     *************/
    const logLevel = process.env.LOG_LEVEL_GQL ? process.env.LOG_LEVEL_GQL.toLowerCase() : 'info';
    if (!process.env.LOG_LEVEL_GQL) console.log(`LOG_LEVEL_GQL not found, defaulting to ${logLevel}...`);

    /******************
     * SET UP LOGGING *
     ******************/
    if (!existsSync('logs')) mkdirSync('logs');
    log4js.configure({
        appenders: {
          out: {
            type: 'stdout', layout: {
              type: 'pattern',
              pattern: '%[%d{yyyy-MM-dd hh:mm:ss,SSS} %p %x{appLabel} [%z]%] %m',
              tokens: { appLabel: (logEvent) => logEvent.categoryName }
            }
          },
          app: {
            type: 'file', filename , maxLogSize: 10000000, compress: true, layout: {
              type: 'pattern',
              pattern: '%d{yyyy-MM-dd hh:mm:ss,SSS} %p %x{appLabel} [%z] %m',
              tokens: { appLabel: (logEvent) => logEvent.categoryName }
            }
          },
        },
        categories: { default: { appenders: ['out', 'app'], level: logLevel } },
      });
    logger = log4js.getLogger(name);
      
    return logger;
}

export async function getContext(req,connection){
    const globalAuth = process.env.GLOBAL_AUTH||false;    
    //If this is a web socket connection pass the context as the request
    const request = !connection ? req : connection.context;
    //Authorization interceptor
    //This is a hack to get around that fact that the JWT plugin gets call after this method
    //so we have to call it here to be able to grab the user and send in into the executionContext
    const auth_token = getHeaderValue(request.headers, 'authorization');

    // Ensure we have an authorization header
    if (globalAuth&&typeof auth_token === 'undefined') throw new AuthenticationError('Authorization header not found');
    
    // Make sure the auth token has a space
    if (globalAuth&&auth_token.indexOf(' ') < 0) {
        logger.error(`Invalid authorization in the request: ${auth_token}`);
        throw new AuthenticationError('Invalid authorization in the header');
    }
    // Split the token
    const values = auth_token.split(' ');
    const authType = values[0];
    const authValue = values[1];
    // Is this JWT authorization?
    let jwt;
    if(authType==='Bearer') {
        jwt = await authPlugin.decode(authValue);

    } else if (globalAuth){
        logger.error(`Invalid authorization type in the request: ${authType}`);
        throw new AuthenticationError('Invalid authorization type');
    }
    if(globalAuth&&!jwt) throw new AuthenticationError('Invalid JWT');

    let profile;
    let user;
    let label='None';
    if(jwt){
        //Below is an example of using additional graph based authorization
        user = jwt.sub;
        let msg;
        try {
            const result = await runQuery(USER_QUERY, {user});
            if (!result.records || !result.records.length) {
                msg = `Unauthorized - "${user}" not in graph or not loginAllowed`
                logger.error("Unauthorized " + msg);
                throw new AuthenticationError(msg);
            }
            profile = result.records[0].get('u'); 
            if(profile.roles&&profile.roles.length>0) label=profile.roles[0]; 
        } catch (error) {
            msg = `Error checking for user "${user}" - ${error.message} `
            logger.error("Unauthorized " + msg);
            throw new AuthenticationError(msg);
        }
    }

    return {
        driver,
        req: request,
        executionContext: driver.session({ impersonatedUser: user }),
        userProfile: profile,
        label
    };
  }

  function getHeaderValue(header, key) {
    var prop = (key + "").toLowerCase();
    for (var p in header) {
        if (prop === (p + "").toLowerCase()) {
            return header[p];
        }
    }
}
  export async function buildApolloServer() {
    logger.debug("Building Apollo server");

    const app = express();
    const http = require('http');
    const port = process.env.GRAPHQL_SERVER_PORT || 4001
    const gpath = process.env.GRAPHQL_SERVER_PATH || '/graphql'
    const host = process.env.GRAPHQL_SERVER_HOST || '0.0.0.0'
    const spath = process.env.GRAPHQL_SERVER_SUBCRIPTION_PATH || '/graphql'
    const httpServer = http.createServer(app);
    const wsServer = new WebSocketServer({
        server: httpServer,
        path: spath
    });

    const server = new ApolloServer({
        context: async ({ req, connection }) => {
            return await getContext(req, connection);
        },
        formatError: (err) => {
            logger.error(`Error name & code = ${err.name} - ${err.extensions.code}`);
            logger.error(err.extensions.exception.stacktrace.join('\n'));
            return err;
        },
        schema: schema,
        introspection: true,
        playground: true,
        plugins: [
            ApolloServerPluginDrainHttpServer({
                httpServer
            }),
            {
                async serverWillStart() {
                    return {
                        async drainServer() {
                            await serverCleanup.dispose();
                        },
                    };
                },
            },
        ],
    });
    const serverCleanup = useServer({
        schema,
        context: async (ctx, msg, args) => {
            return await getContext(null, { context: ctx.connectionParams, query: msg.payload.query });
        }
    }, wsServer);

    /*
    * Optionally, apply Express middleware for authentication, etc
    * This also also allows us to specify a path for the GraphQL endpoint
    */
    await server.start();
    server.applyMiddleware({ app, gpath })

    // Specify host, port and path for GraphQL endpoint
    httpServer.listen({ host, port, gpath }, () => {
        logger.info(`GraphQL server ready at http://${host}:${port}${server.graphqlPath}`);
        logger.info(`GraphQL Subscription ready at ws://${host}:${port}${wsServer.options.path}`);
    });
    
    return server;
}

export async function buildWebServers() {
    logger.debug("Starting HTTP server");
    const app = express();
    const http = require('http');
    const port = process.env.GRAPHQL_SERVER_PORT || 4001
    const gpath = process.env.GRAPHQL_SERVER_PATH || '/graphql'
    const host = process.env.GRAPHQL_SERVER_HOST || '0.0.0.0'
    const spath = process.env.GRAPHQL_SERVER_SUBCRIPTION_PATH || '/graphql'
    const httpServer = http.createServer(app);
    const wsServer = new WebSocketServer({
        server: httpServer,
        path: spath
    });
    // Specify host, port and path for GraphQL endpoint
    httpServer.listen({ host, port, gpath }, () => {
        logger.info(`GraphQL server ready at http://${host}:${port}${server.graphqlPath}`);
        logger.info(`GraphQL Subscription ready at ws://${host}:${wsServer.options.port}${wsServer.options.path}`);
    });
    return { httpServer, wsServer };
}

export async function setupNeo4j(auth, subscriptions) {
    // Setup Auth Plugin
    authPlugin = auth; 

    // CREATE NEO4J DRIVER
    logger.info('Creating neo4j driver...');
    createDriver(
        process.env.NEO4J_URI,
        process.env.NEO4J_USER,
        process.env.NEO4J_PASSWORD,
        process.env.NEO4J_DATABASE,
        process.env.NEO4J_ENCRYPTED === "true",
        true
    );
    try {
        const typeDefs = readdirSync(
            path.join(__dirname, '../src/types')).map((filename) => require('../src/types/' + filename)
            );
        const resolvers = mergeResolvers(
            loadFilesSync(path.join(__dirname, "./resolvers/*.js"))
            );
        logger.info('Loading neo4j-graphql types...');
        neoSchema = new Neo4jGraphQL({
            typeDefs,
            resolvers,
            logger: {
                log: e => {
                    logger.info('Neo4jGraphql error:');
                    logger.info(e);
                }
            },
            allowUndefinedInResolve: true,
            plugins: {
                subscriptions,
                auth: authPlugin,
            },
        });
        schema = await neoSchema.getSchema();

        logger.info(`Verifying connection to neo4j (${process.env.NEO4J_URI}, database=${process.env.NEO4J_DATABASE})...`);
        const result = await driver.verifyConnectivity();
        logger.info(`Neo4j connected: ${JSON.stringify(result)}`);
        return driver; //used for testing
    } catch (error) {
        logger.error(error);
        process.exit();
    }
}

export function createDriver(uri, username, password, databaseName, encrypted=false, disableLosslessIntegers=true) {
    databaseName = databaseName;
    let driverConfig = {};
    if (!uri.match(/bolt\+s/) && !uri.match(/neo4j\+s/)) {
        driverConfig = {encrypted: encrypted};
    }
    driverConfig.disableLosslessIntegers = disableLosslessIntegers;
    if (!uri) {
        logger.info(`Using default neo4j uri ${uri}`);
        uri = 'bolt://localhost:7687';
    }
    if (!username) {
        logger.info(`Using default neo4j username ${username}...`);
        username = 'neo4j';
    }
    if (!password) {
        logger.info(`Using default neo4j password...`);
        password = 'password';
    }
    driver = neo4j.driver(uri, neo4j.auth.basic(username, password), driverConfig);
    logger.info(driver);
}

export async function runQuery(query, args, writeMode,bookmarks){
    // logger.info(3, driver.session);
    writeMode = writeMode === true;
    logger.debug('query=' + query);
    if (args) logger.debug(':params ' + JSON.stringify(args));
    const session = driver.session({database: databaseName, bookmarks});
    let result;
    try {
        result = (writeMode) 
            ? await session.writeTransaction(tx => tx.run(query, args))
            : await session.readTransaction(tx => tx.run(query, args));
        result.lastBookmark=session.lastBookmark();
    } catch (error) {
        logger.error(`${error.message} - ${error.stack}`);
        result = error;
    } finally {
        await session.close();
        return result;
    }
}

export async function readQuery(query, args){
    return runQuery(query, args, false); 
}

export async function writeQuery(query, args){
    return runQuery(query, args, true);
}

export function processResult(result) {
    if (result && result.constructor && result.constructor.name === 'Neo4jError') {
        if (result.message && result.message.match) {
            if (result.message.match(/permission denied$/)) {
                throw new Error('You do not have sufficient permission for that operation');
            } else if (result.message.match(/permission denied \(wrong org\)$/)) {
                throw new Error('Item does not exist');
            } else {
                throw new Error(result.message);
            }
        } else {
            throw new Error(result.message);
        }
    }

    var resultSet = {headers: [], rows: []}
    if (result && result.records && result.records.map) {
        result.records.map(record => {
            if (resultSet.headers.length === 0) {
                resultSet.headers = (record.keys) ? record.keys.filter(key => key !== 'null') : [];
            }
            var hasValues = false;
            var row = {};
            record.keys.forEach(function (key) {
                var value = record.get(key);
                row[key] = value;
                if (value)
                    hasValues = true;
            });
            if (hasValues)
                resultSet.rows.push(row);
        });
    }
    return resultSet;
}

export function getFirstRowValue(resultSet, key, defaultValue){
    let hasError = false;
    if (!resultSet) {
        logger.error(`resultSet is ${resultSet}`);
        hasError = true;
    } else if (!resultSet.rows) {
        logger.error(`resultSet.rows is ${resultSet.rows}`);
        hasError = true;
    } else if (resultSet.rows.length === 0) {
        logger.error(`Result set is empty`);
        hasError = true;
    } else if (resultSet.rows.length > 1) {
        logger.error(`Result set has more than one result`);
        hasError = true;
    }
    if (hasError) {
        if (defaultValue) throw new Error(defaultValue);
        else return null;
    }

    return resultSet.rows[0][key];
}