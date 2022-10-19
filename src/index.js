import { setupLogger, setupNeo4j, buildApolloServer } from "./setup";
import { Neo4jGraphQLAuthJWKSPlugin } from "@neo4j/graphql-plugin-auth";
import { TestAuthPlugin } from "./plugins/TestAuthPlugin";
import dotenv from "dotenv"

async function main(){
  dotenv.config();  // set environment variables from .env
  const auth =new Neo4jGraphQLAuthJWKSPlugin({
    jwksEndpoint: process.env.JWKS_ENDPOINT,
    globalAuthentication: process.env.GLOBAL_AUTH||false,
    });
  //For testing: this plugin doesn't validate the token so you can use something like 'Bearer TestHeader.eyJzdWIiOiJlYXN0VXNlciJ9.TestSignature'
  //const auth = new TestAuthPlugin();
  await setupLogger('logs/sample-graphql.log','sample.index');
  await setupNeo4j(auth);
  await buildApolloServer();
}
main();